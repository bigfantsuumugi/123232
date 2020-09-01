import '../../../../src/bp/sdk/botpress.d'

// tslint:disable-next-line: ordered-imports
import { NLU, IO } from 'botpress/sdk'

import _ from 'lodash'
import { makePredictor } from './predict'

const frenchUtt = 'DONNE MOI UNE BANANE'
const englishUtt = 'GIVE ME A BANANA'
const germanUtt = 'GIB MIR EINE BANANE'

const fr = 'fr'
const en = 'en'
const de = 'de'

function makeEngineMock(loadedModels: string[]): NLU.Engine {
  return (<Partial<NLU.Engine>>{
    loadModel: jest.fn(async (m: NLU.Model) => {
      loadedModels.push(m.languageCode)
    }),

    predict: jest.fn(async (textInput: string, ctx: string[], language: string) => {
      let detectedLanguage = de
      if (textInput === frenchUtt) {
        detectedLanguage = fr
      } else if (textInput === englishUtt) {
        detectedLanguage = en
      }

      if (loadedModels.includes(language)) {
        return <IO.EventUnderstanding>{
          detectedLanguage,
          entities: [],
          predictions: {},
          includedContexts: ctx,
          language,
          ms: Date.now()
        }
      }
      return <IO.EventUnderstanding>{ error: 'invalid_predictor', detectedLanguage }
    })
  }) as NLU.Engine
}

// model for 'en' and 'fr' only
function makeModelGetterMock(): (languageCode: string) => Promise<NLU.Model | undefined> {
  return jest.fn(async (languageCode: string) => {
    if (languageCode === en || languageCode === fr) {
      return <NLU.Model>{
        startedAt: new Date(),
        finishedAt: new Date(),
        hash: 'heyheyhey ;)',
        languageCode,
        data: {
          input: '',
          output: ''
        }
      }
    }
  }) as (languageCode: string) => Promise<NLU.Model | undefined>
}

const assertNoModelLoaded = (engineLoadMock: jest.Mock, ghostMock: jest.Mock) => {
  expect(ghostMock.mock.calls.length).toBe(0)
  expect(engineLoadMock.mock.calls.length).toBe(0)
}

const assertModelLoadedFromFS = (ghostMock: jest.Mock, lang: string) => {
  expect(ghostMock.mock.calls.length).toBe(1)
  expect(ghostMock.mock.calls[0][0]).toBe(lang)
}

const assertModelLoadedInEngine = (engineLoadMock: jest.Mock, lang: string) => {
  expect(engineLoadMock.mock.calls.length).toBe(1)
  expect(engineLoadMock.mock.calls[0][0].languageCode).toBe(lang)
}

const assertPredictCalled = (enginePredictMock: jest.Mock, nTimes: number) => {
  expect(enginePredictMock.mock.calls.length).toBe(nTimes)
}

describe('predict', () => {
  test('predict with default == detected language should predict once', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([en])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(englishUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(en)
    expect(result.detectedLanguage).toBe(en)

    assertPredictCalled(engine.predict as jest.Mock, 1)
    assertNoModelLoaded(engine.loadModel as jest.Mock, modelGetter)
  })

  test('predict with default != detected language should predict twice', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([en, fr])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(frenchUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(fr)
    expect(result.detectedLanguage).toBe(fr)

    assertPredictCalled(engine.predict as jest.Mock, 2)
    assertNoModelLoaded(engine.loadModel as jest.Mock, modelGetter)
  })

  test('predict with default == detected but default not loaded should predict then load then predict', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(englishUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(en)
    expect(result.detectedLanguage).toBe(en)

    assertPredictCalled(engine.predict as jest.Mock, 2)
    assertModelLoadedFromFS(modelGetter, en)
    assertModelLoadedInEngine(engine.loadModel as jest.Mock, en)
  })

  test('predict with default != detected and default not loaded shoud not try to load default', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([fr])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(frenchUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(fr)
    expect(result.detectedLanguage).toBe(fr)

    assertPredictCalled(engine.predict as jest.Mock, 2)
    assertNoModelLoaded(engine.loadModel as jest.Mock, modelGetter)
  })

  test('predict with default != detected and detected not loaded should predict twice then load then predict', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([en])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(frenchUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(fr)
    expect(result.detectedLanguage).toBe(fr)

    assertPredictCalled(engine.predict as jest.Mock, 3)
    assertModelLoadedFromFS(modelGetter, fr)
    assertModelLoadedInEngine(engine.loadModel as jest.Mock, fr)
  })

  test('predict with default != detected but no model for detected in FS should return default', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock
    const engine = makeEngineMock([en])

    // act
    const defaultLang = en
    const predict = makePredictor(modelGetter, engine, defaultLang)
    const result = await predict(germanUtt, ['global'])

    // assert
    expect(result).toBeDefined()
    expect(result.language).toBe(en)
    expect(result.detectedLanguage).toBe(de)

    assertPredictCalled(engine.predict as jest.Mock, 2)
    assertModelLoadedFromFS(modelGetter, de)
  })

  test('predict with default == detected but no model for lang in FS should throw', async () => {
    // arrange
    const modelGetter = makeModelGetterMock() as jest.Mock

    const defaultLang = 'de'
    const engine = makeEngineMock([])

    // act & assert
    const predict = makePredictor(modelGetter, engine, defaultLang)

    let errorOccured = false
    try {
      await predict(germanUtt, ['global'])
    } catch {
      errorOccured = true
    }

    // assert
    expect(errorOccured).toBe(true)
  })
})
