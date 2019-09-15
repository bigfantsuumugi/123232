import * as sdk from 'botpress/sdk'
import fs, { readFileSync } from 'fs'
import _ from 'lodash'
import kmeans from 'ml-kmeans'
import tmp from 'tmp'

import { getProgressPayload } from '../../tools/progress'
import { SPACE } from '../../tools/token-utils'
import { LanguageProvider, NLUStructure, Token2Vec } from '../../typings'
import { BIO, Sequence, Token } from '../../typings'
import { TfidfOutput } from '../intents/tfidf'

import { computeBucket, countAlpha, countNum, countSpecial, getFeaturesPairs, getTFIDFfeature } from './featureizer'
import { generatePredictionSequence } from './pre-processor'

const debug = DEBUG('nlu').sub('slots')
const debugTrain = debug.sub('train')
const debugExtract = debug.sub('extract')
const debugVectorize = debug.sub('vectorize')

const quartile = computeBucket(4)

const crfPayloadProgress = progress => ({
  value: 0.75 + Math.floor(progress / 4)
})

const createProgressPayload = getProgressPayload(crfPayloadProgress)

const MIN_SLOT_CONFIDENCE = 0.1
// TODO grid search / optimization for those hyperparams
const K_CLUSTERS = 8
const KMEANS_OPTIONS = {
  iterations: 250,
  initialization: 'random',
  seed: 666 // so training is consistent
}
const CRF_TRAINER_PARAMS = {
  c1: '0.0001',
  c2: '0.01',
  max_iterations: '500',
  'feature.possible_transitions': '1',
  'feature.possible_states': '1'
}

export type TagResult = { probability: number; label: string }

export default class CRFExtractor {
  private _isTrained: boolean = false
  private _ftModelFn = ''
  private _crfModelFn = ''
  private _ft!: sdk.MLToolkit.FastText.Model
  private _tagger!: sdk.MLToolkit.CRF.Tagger
  private _kmeansModel

  constructor(
    private toolkit: typeof sdk.MLToolkit,
    private realtime: typeof sdk.realtime,
    private realtimePayload: typeof sdk.RealTimePayload,
    private languageProvider: LanguageProvider,
    private readonly language: string
  ) {}

  async load(traingingSet: Sequence[], languageModelBuf: Buffer, crf: Buffer) {
    // load language model
    const ftModelFn = tmp.tmpNameSync({ postfix: '.bin' })
    fs.writeFileSync(ftModelFn, languageModelBuf)

    const ft = new this.toolkit.FastText.Model()
    await ft.loadFromFile(ftModelFn)
    this._ft = ft
    this._ftModelFn = ftModelFn
    // load kmeans (retrain because there is no simple way to store it)
    await this._trainKmeans(traingingSet)

    // load crf model
    this._crfModelFn = tmp.tmpNameSync()
    fs.writeFileSync(this._crfModelFn, crf)
    this._tagger = this.toolkit.CRF.createTagger()
    await this._tagger.open(this._crfModelFn)
    this._isTrained = true
  }

  async train(
    trainingSet: Sequence[],
    intentVocabs: { [token: string]: string[] },
    allowedEntitiesPerIntents: { [name: string]: string[] },
    tfidf: TfidfOutput,
    token2Vec: Token2Vec
  ): Promise<{ language: Buffer; crf: Buffer }> {
    this._isTrained = false
    if (trainingSet.length >= 2) {
      debugTrain('start training')
      debugTrain('training language model')
      await this._trainLanguageModel(trainingSet)
      this.realtime.sendPayload(this.realtimePayload.forAdmins('statusbar.event', createProgressPayload(0.2)))

      debugTrain('training kmeans')
      await this._trainKmeans(trainingSet)
      this.realtime.sendPayload(this.realtimePayload.forAdmins('statusbar.event', createProgressPayload(0.4)))

      debugTrain('training CRF')
      await this._trainCrf(trainingSet, intentVocabs, allowedEntitiesPerIntents, tfidf, token2Vec)
      this.realtime.sendPayload(this.realtimePayload.forAdmins('statusbar.event', createProgressPayload(0.6)))

      debugTrain('reading tagger')
      this._tagger = this.toolkit.CRF.createTagger()
      await this._tagger.open(this._crfModelFn)
      this._isTrained = true
      debugTrain('done training')
      this.realtime.sendPayload(this.realtimePayload.forAdmins('statusbar.event', createProgressPayload(0.8)))
      return {
        language: readFileSync(this._ftModelFn),
        crf: readFileSync(this._crfModelFn)
      }
    } else {
      debugTrain('training set too small, skipping training')
      return {
        language: undefined,
        crf: undefined
      }
    }
  }

  /**
   * Returns an object with extracted slots name as keys.
   * Each slots under each keys can either be a single Slot object or Array<Slot>
   * return value example:
   * slots: {
   *   artist: {
   *     name: "artist",
   *     value: "Kanye West",
   *     entity: [Object] // corresponding sdk.NLU.Entity
   *   },
   *   songs : [ multiple slots objects here]
   * }
   */
  async extract(
    ds: NLUStructure,
    intentDef: sdk.NLU.IntentDefinition,
    intentVocab,
    allowedEntitiesPerIntents,
    tfidf: TfidfOutput,
    token2Vec: Token2Vec
  ): Promise<sdk.NLU.SlotCollection> {
    debugExtract(ds.sanitizedLowerText, { entities: ds.entities })

    if (!this._isTrained) {
      debugExtract('CRF not trained, skipping slot extraction', { text: ds.sanitizedLowerText })
      return {}
    }

    // TODO: Remove this line and make this part of the predictionPipeline instead
    const seq = await generatePredictionSequence(ds.rawText.toLowerCase(), intentDef, ds.entities, ds.tokens)

    const tags = await this._tag(seq, intentVocab, allowedEntitiesPerIntents, tfidf, token2Vec)

    // notice usage of zip here, we want to loop on tokens and tags at the same index
    return (_.zip(seq.tokens, tags) as [Token, TagResult][])
      .filter(([token, result]) => {
        if (!token || !result || !result.label || result.label === BIO.OUT) {
          return false
        }

        const slotName = result.label.slice(2)
        return intentDef.slots.find(slotDef => slotDef.name === slotName) !== undefined
      })
      .reduce((slotCollection: any, [token, tag]) => {
        const slotName = tag.label.slice(2)
        const slotDef = intentDef.slots.find(x => x.name == slotName)

        const slot = this._makeSlot(slotName, token, slotDef, ds.entities, tag.probability)

        if (!slot) {
          return slotCollection
        }

        if (tag.label[0] === BIO.INSIDE && slotCollection[slotName]) {
          if (!slotCollection[slotName].entity) {
            const maybeSpace = token.value.startsWith(SPACE) ? ' ' : ''
            const newSource = `${slotCollection[slotName].source}${maybeSpace}${token.cannonical}`
            slotCollection[slotName].source = newSource
            slotCollection[slotName].value = newSource
          }
        } else if (tag.label[0] === BIO.BEGINNING && slotCollection[slotName]) {
          const highest = _.maxBy([slotCollection[slotName], slot], 'confidence')
          slotCollection[slotName] = highest
          // At the moment we keep the highest confidence only
          // we might want to keep the slot array feature so this is kept as commented
          // I feel like it would make much more sens to enable this only when configured by the user
          // i.e user marks a slot as an array (configurable) and only then we make an array

          // if the tag is beginning and the slot already exists, we create need a array slot
          // if (Array.isArray(slotCollection[slotName])) {
          //   slotCollection[slotName].push(slot)
          // } else {
          //   // if no slots exist we assign a slot to the slot key
          //   slotCollection[slotName] = [slotCollection[slotName], slot]
          // }
        } else {
          slotCollection[slotName] = slot
        }

        return slotCollection
      }, {})
  }

  // this is made "protected" to facilitate model validation
  async _tag(
    seq: Sequence,
    intentVocab,
    allowedEntitiesPerIntents,
    tfidf: TfidfOutput,
    token2Vec: Token2Vec
  ): Promise<TagResult[]> {
    if (!this._isTrained) {
      throw new Error('Model not trained, please call train() before')
    }
    const inputVectors: string[][] = []

    for (let i = 0; i < seq.tokens.length; i++) {
      const featureVec = await this._vectorize(
        seq.tokens,
        seq.intent,
        i,
        intentVocab,
        allowedEntitiesPerIntents[seq.intent],
        tfidf,
        token2Vec,
        true
      )
      inputVectors.push(featureVec)
    }

    const probs = this._tagger.marginal(inputVectors)
    const chain = probs.map(token =>
      _.chain(token)
        .toPairs()
        .maxBy('1')
        .thru(([label, prob]) => ({
          label: label.replace('/any', ''),
          probability: prob
        }))
        .value()
    )
    return chain
  }

  private _makeSlot(
    slotName: string,
    token: Token,
    slotDef: sdk.NLU.SlotDefinition,
    entities: sdk.NLU.Entity[],
    confidence: number
  ): sdk.NLU.Slot {
    if (confidence < MIN_SLOT_CONFIDENCE) {
      return
    }

    const tokenSpaceOffset = token.value.startsWith(SPACE) ? 1 : 0
    const entity =
      slotDef &&
      entities.find(
        e =>
          slotDef.entities.indexOf(e.name) !== -1 &&
          e.meta.start <= token.start + tokenSpaceOffset &&
          e.meta.end >= token.end
      )

    // TODO: we might want to build up an entity with populated data with and 'any' slot
    if (slotDef && !slotDef.entities.includes('any') && !entity) {
      return
    }

    const value = _.get(entity, 'data.value', token.cannonical)
    const source = _.get(entity, 'meta.source', token.cannonical)

    const slot = {
      name: slotName,
      source,
      value,
      confidence
    } as sdk.NLU.Slot

    if (entity) {
      slot.entity = entity
    }

    return slot
  }

  private async _trainKmeans(sequences: Sequence[]): Promise<any> {
    const tokens = _.flatMap(sequences, s => s.tokens)

    if (_.isEmpty(tokens)) {
      return
    }

    const data = await Promise.mapSeries(tokens, t => this._ft.queryWordVectors(t.cannonical.toLowerCase()))

    const k = data.length > K_CLUSTERS ? K_CLUSTERS : 2
    try {
      this._kmeansModel = kmeans(data, k, KMEANS_OPTIONS)
    } catch (error) {
      throw Error(`Error training K-means model, error is: ${error}`)
    }
  }
  private async _trainCrf(
    trainingSet: Sequence[],
    intentVocab: { [token: string]: string[] },
    allowedEntitiesPerIntents: { [name: string]: string[] },
    tfidf: TfidfOutput,
    token2Vec: Token2Vec
  ) {
    this._crfModelFn = tmp.fileSync({ postfix: '.bin' }).name
    const trainer = this.toolkit.CRF.createTrainer()
    trainer.set_params(CRF_TRAINER_PARAMS)
    trainer.set_callback(str => {
      debugTrain('CRFSUITE', str)
      /* swallow training results */
    })

    for (const seq of trainingSet) {
      const inputVectors: string[][] = []
      const labels: string[] = []
      for (let i = 0; i < seq.tokens.length; i++) {
        const featureVec = await this._vectorize(
          seq.tokens,
          seq.intent,
          i,
          intentVocab,
          allowedEntitiesPerIntents[seq.intent],
          tfidf,
          token2Vec,
          false
        )

        inputVectors.push(featureVec)

        const isAny = seq.tokens[i].slot && !seq.tokens[i].matchedEntities.length ? '/any' : ''
        const labelSlot = seq.tokens[i].slot ? `-${seq.tokens[i].slot}` : ''
        labels.push(`${seq.tokens[i].tag}${labelSlot}${isAny}`)
      }
      trainer.append(inputVectors, labels)
    }

    trainer.train(this._crfModelFn)
  }

  private async _trainLanguageModel(samples: Sequence[]) {
    this._ftModelFn = tmp.fileSync({ postfix: '.bin' }).name
    const ftTrainFn = tmp.fileSync({ postfix: '.txt' }).name

    const ft = new this.toolkit.FastText.Model()

    const trainContent = samples.reduce((corpus, seq) => {
      const cannonicSentence = seq.tokens
        .map(token => (token.tag === BIO.OUT ? token.cannonical.toLowerCase() : token.slot))
        .join(' ') // do not use sentencepiece space char
      return `${corpus}${cannonicSentence}\n`
    }, '')

    fs.writeFileSync(ftTrainFn, trainContent, 'utf8')

    const skipgramParams = {
      input: ftTrainFn,
      minCount: 2,
      dim: 15,
      lr: 0.05,
      epoch: 50,
      wordNgrams: 3
    }

    debugTrain('training skipgram', skipgramParams)
    await ft.trainToFile('skipgram', this._ftModelFn, skipgramParams)

    this._ft = ft
  }

  private async _vectorizeToken(
    token: Token,
    intentName: string,
    featPrefix: string,
    includeCluster: boolean,
    intentVocab: { [token: string]: string[] },
    allowedEntities: string[],
    tfidf: TfidfOutput,
    token2Vec: Token2Vec,
    isPredict: boolean
  ): Promise<string[]> {
    const vector: string[] = []
    const boost = isPredict ? 3 : 1

    if (!token.cannonical) {
      return []
    }

    // TODO refactor this func, return an array of {name: string, value: string, boost?: number}
    // call makeCrfAttr only in vectorize will look like this._vectorizeToken(/** args */).map(_makeCrfAttr.bind(this, featPrefix))

    if (includeCluster) {
      const cluster = await this._getWordCluster(token.cannonical.toLowerCase())
      vector.push(this._makeCrfAttr(featPrefix, 'cluster', cluster))
    }

    if (!token.matchedEntities.length) {
      vector.push(this._makeCrfAttr(featPrefix, 'word', token.cannonical.toLowerCase(), boost))
    }

    vector.push(this._makeCrfAttr(featPrefix, 'space', token.value.startsWith(SPACE)))
    vector.push(this._makeCrfAttr(featPrefix, 'alpha', countAlpha(token.cannonical)))
    vector.push(this._makeCrfAttr(featPrefix, 'num', countNum(token.cannonical)))
    vector.push(this._makeCrfAttr(featPrefix, 'special', countSpecial(token.cannonical)))

    // that means the word is part of possible list type entities and in intent vocab
    const inVocab = !token.slot && _.get(intentVocab, token.cannonical.toLowerCase(), []).includes(intentName)
    vector.push(this._makeCrfAttr(featPrefix, 'inVocab', inVocab))

    const wordWeight = await getTFIDFfeature(
      tfidf,
      token.cannonical.toLowerCase(),
      this.languageProvider,
      token2Vec,
      this.language
    )
    vector.push(this._makeCrfAttr(featPrefix, 'weight', wordWeight))

    const entitiesFeatures = _.chain(token.matchedEntities)
      .intersection(allowedEntities)
      .thru(ents => (ents.length ? ents : ['none']))
      .map(ent => this._makeCrfAttr(featPrefix, 'entity', ent, boost))
      .value()

    return [...vector, ...entitiesFeatures]
  }

  private _makeCrfAttr = (prefix: string, attrName: string, attrVal: { toString: () => string }, boost = 1): string =>
    `${prefix}${attrName}=${(attrVal && attrVal.toString()) || ''}:${boost}`

  // TODO maybe use a slice instead of the whole token seq ?
  private async _vectorize(
    tokens: Token[],
    intentName: string,
    idx: number,
    intentVocab: { [token: string]: string[] },
    allowedEntities: string[],
    tfidf: TfidfOutput,
    token2Vec: Token2Vec,
    isPredict: boolean
  ): Promise<string[]> {
    const boost = isPredict ? 100 : 100
    const seqFeatures = [`intent=${intentName}:${boost}`.toLowerCase()]

    const prev =
      idx === 0
        ? ['__BOS__']
        : await this._vectorizeToken(
            tokens[idx - 1],
            intentName,
            'w[-1]',
            true,
            intentVocab,
            allowedEntities,
            tfidf,
            token2Vec,
            isPredict
          )

    const current = await this._vectorizeToken(
      tokens[idx],
      intentName,
      'w[0]',
      false,
      intentVocab,
      allowedEntities,
      tfidf,
      token2Vec,
      isPredict
    )
    current.push(`w[0]quartile=${quartile(idx, tokens.length - 1)}`)

    const next =
      idx === tokens.length - 1
        ? ['__EOS__']
        : await this._vectorizeToken(
            tokens[idx + 1],
            intentName,
            'w[1]',
            true,
            intentVocab,
            allowedEntities,
            tfidf,
            token2Vec,
            isPredict
          )

    debugVectorize(`"${tokens[idx].cannonical}" (${idx})`, { prev, current, next })

    const prevPairs = idx > 0 ? getFeaturesPairs(prev, current, ['word', 'vocab', 'weight']) : []
    const nextPairs = idx < tokens.length - 1 ? getFeaturesPairs(current, next, ['word', 'vocab', 'weight']) : []

    return [...seqFeatures, ...prev, ...current, ...next, ...prevPairs, ...nextPairs]
  }

  private async _getWordCluster(word: string): Promise<number> {
    const vector = await this._ft.queryWordVectors(word)
    return this._kmeansModel.nearest([vector])[0]
  }
}
