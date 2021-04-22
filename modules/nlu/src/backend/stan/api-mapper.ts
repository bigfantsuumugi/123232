import { NLU } from 'botpress/sdk'

import _ from 'lodash'
import {
  TrainInput,
  PredictOutput as StanPredictOutput,
  ListEntityDefinition,
  PatternEntityDefinition,
  EntityDefinition as StanEntityDefinition,
  SlotDefinition as StanSlotDefinition,
  IntentDefinition as StanIntentDefinition,
  IntentPrediction as StanIntentPrediction,
  SlotPrediction as StanSlotPrediction,
  ContextPrediction as StanContextPrediction,
  EntityPrediction as StanEntityPrediction
} from './typings_v1'

type BpSlotDefinition = NLU.SlotDefinition
type BpIntentDefinition = NLU.IntentDefinition
type BpEntityDefinition = NLU.EntityDefinition

type BpSlotPrediction = NLU.Slot
type BpEntityPrediction = NLU.Entity
export interface BpPredictOutput {
  entities: BpEntityPrediction[]
  predictions: Dic<NLU.ContextPrediction>
  spellChecked: string
}

type BpContextPrediction = NLU.ContextPrediction
interface BpTrainSet {
  intentDefs: BpIntentDefinition[]
  entityDefs: BpEntityDefinition[]
  languageCode: string
  seed: number
}

/**
 * ################
 * ### Training ###
 * ################
 */

const isListEntity = (e: BpEntityDefinition) => {
  return e.type === 'list'
}

const isPatternEntity = (e: BpEntityDefinition) => {
  return e.type === 'pattern'
}

const isCustomEntity = (e: BpEntityDefinition) => {
  return isListEntity(e) || isPatternEntity(e)
}

const mapInputSlot = (slot: BpSlotDefinition): StanSlotDefinition => {
  const { name, entities } = slot
  return {
    name,
    entities
  }
}

const makeIntentMapper = (lang: string) => (intent: BpIntentDefinition): StanIntentDefinition => {
  const { contexts, name, utterances, slots } = intent
  return {
    contexts,
    name,
    utterances: utterances[lang],
    slots: slots.map(mapInputSlot)
  }
}

const mapList = (listDef: BpEntityDefinition): ListEntityDefinition => {
  const { name, fuzzy, occurrences, examples } = listDef

  return {
    name,
    type: 'list',
    fuzzy: fuzzy!,
    values: occurrences!
  }
}

const mapPattern = (patternDef: BpEntityDefinition): PatternEntityDefinition => {
  const { name, pattern, matchCase, examples } = patternDef

  return {
    name,
    type: 'pattern',
    regex: pattern!,
    case_sensitive: matchCase!,
    examples: examples ?? []
  }
}

const mapEntityDefinition = (e: BpEntityDefinition): StanEntityDefinition => {
  return isPatternEntity(e) ? mapPattern(e) : mapList(e)
}

export const mapTrainSet = (bpTrainSet: BpTrainSet): TrainInput => {
  const { intentDefs, entityDefs, languageCode, seed } = bpTrainSet

  const entities = entityDefs.filter(isCustomEntity).map(mapEntityDefinition)

  const intentMapper = makeIntentMapper(languageCode)
  const intents = intentDefs.map(intentMapper)

  return {
    intents,
    entities,
    language: languageCode,
    seed
  }
}

/**
 * ##################
 * ### Prediction ###
 * ##################
 */

function mapEntity(entity: StanEntityPrediction): BpEntityPrediction {
  const { name, type, start, end, confidence, source, value, unit } = entity

  return {
    name,
    type,
    meta: {
      confidence,
      start,
      end,
      sensitive: false,
      source
    },
    data: {
      unit: unit!,
      value
    }
  }
}

function mapIntent(intent: StanIntentPrediction): BpContextPrediction['intents'][0] {
  const { confidence, slots, extractor, name } = intent
  return {
    label: name,
    confidence,
    extractor,
    slots: _(slots)
      .map(mapOutputSlot)
      .keyBy(s => s.name)
      .value()
  }
}

function mapOutputSlot(slot: StanSlotPrediction): BpSlotPrediction {
  const { confidence, start, end, value, source, name, entity } = slot

  return {
    confidence,
    start,
    end,
    entity: entity && mapEntity(entity),
    name,
    source,
    value
  }
}

function mapContext(context: StanContextPrediction): BpContextPrediction {
  const { confidence, oos, intents } = context

  return {
    confidence,
    oos,
    intents: intents.map(mapIntent)
  }
}

export const mapPredictOutput = (predictOutput: StanPredictOutput): BpPredictOutput => {
  const { contexts, spellChecked, entities } = predictOutput
  return {
    predictions: _(contexts)
      .keyBy(c => c.name)
      .mapValues(mapContext)
      .value(),
    spellChecked,
    entities: entities.map(mapEntity)
  }
}
