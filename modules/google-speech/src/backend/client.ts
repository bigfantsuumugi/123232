import { protos, SpeechClient } from '@google-cloud/speech'
import { TextToSpeechClient } from '@google-cloud/text-to-speech'
import axios from 'axios'
import * as sdk from 'botpress/sdk'
import { closest } from 'common/number'
import * as mm from 'music-metadata'

import { Config } from '../config'
import { Audio } from './audio'
import { SAMPLE_RATES } from './constants'
import {
  IRecognitionAudio,
  IRecognitionConfig,
  ISynthesizeSpeechRequest,
  Container,
  Codec,
  AudioEncoding,
  IRecognizeRequest
} from './typings'
import { TimeoutError, timeoutFn } from './utils'

const debug = DEBUG('google-speech')
const debugSpeechToText = debug.sub('speech-to-text')
const debugTextToSpeech = debug.sub('text-to-speech')

export class GoogleSpeechClient {
  private logger: sdk.Logger
  private speechClient: SpeechClient
  private textToSpeechClient: TextToSpeechClient

  //Transcription is limited to 60 seconds audio.
  private readonly defaultMaxAudioDuration = 60

  constructor(private bp: typeof sdk, private botId: string, private readonly config: Config) {
    this.logger = this.bp.logger.forBot(this.botId)
  }

  public async initialize() {
    if (!this.config.clientEmail || !this.config.privateKey) {
      return this.logger.error(
        '[GoogleSpeech] The clientEmail and privateKey must be configured in order to use this module.'
      )
    }

    try {
      this.speechClient = new SpeechClient({
        credentials: {
          client_email: this.config.clientEmail,
          private_key: this.config.privateKey
        },
        projectId: this.config.projectId
      })
      await this.speechClient.initialize()
      // Test the credentials by authenticating to the Google API
      await this.speechClient.auth.getAccessToken()

      this.textToSpeechClient = new TextToSpeechClient({
        credentials: {
          client_email: this.config.clientEmail,
          private_key: this.config.privateKey
        },
        projectId: this.config.projectId
      })
      await this.textToSpeechClient.initialize()
      // Test the credentials by authenticating to the Google API
      await this.textToSpeechClient.auth.getAccessToken()

      this.logger.info('GoogleSpeech configuration successful!')
    } catch (err) {
      this.logger.error('Error ocurred while initializing GoogleSpeech module:', err.message)
    }
  }

  public async close() {
    try {
      await this.speechClient.close()
      await this.textToSpeechClient.close()
    } catch (err) {
      this.logger.error('Error ocurred while closing connections to Google APIs:', err.message)
    }
  }

  public async speechToText(audioFileUrl: string, language: string, timeout?: string): Promise<string | undefined> {
    debugSpeechToText('Received audio to recognize:', audioFileUrl)

    let { data: buffer } = await axios.get<Buffer>(audioFileUrl, { responseType: 'arraybuffer' })

    let meta = await mm.parseBuffer(buffer)
    const maxAudioDuration = Math.min(this.config.maxAudioDuration, this.defaultMaxAudioDuration)
    if (meta.format.duration > maxAudioDuration) {
      this.logger.warn(
        `Audio file duration (${meta.format.duration}s) exceed maximum duration allowed of: ${maxAudioDuration}s`
      )
      return
    }

    let encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding

    const container = meta.format.container?.toLowerCase()
    const codec = meta.format.codec?.toLowerCase()
    if (container === 'ogg' && codec === 'opus') {
      encoding = AudioEncoding.OGG_OPUS

      const sampleRates = SAMPLE_RATES[Container[container]][Codec[codec]]
      if (!sampleRates.includes(meta.format.sampleRate)) {
        const audio = new Audio(Container.ogg, Codec.opus)
        const newSampleRate = closest(sampleRates, meta.format.sampleRate)

        debugSpeechToText(`Re-sampling audio file to ${newSampleRate}Hz`)

        buffer = audio.resample(buffer, newSampleRate)

        debugSpeechToText('Audio file successfully re-sampled')

        meta = await mm.parseBuffer(buffer)
      }
    } else if (container === 'mpeg' && codec === 'mpeg 1 layer 3') {
      // No need to specify the encoding nor re-sample the file
    } else {
      this.logger.warn('Audio file format not supported. Skipping...', { ...meta.format })

      return
    }

    debugSpeechToText('Audio file metadata', meta)

    // Note that transcription is limited to 60 seconds audio.
    // Use a GCS file for audio longer than 1 minute.
    const audio: IRecognitionAudio = {
      content: buffer
    }

    const config: IRecognitionConfig = {
      encoding,
      sampleRateHertz: meta.format.sampleRate,
      languageCode: this.languageCode(language)
    }

    const request: IRecognizeRequest = {
      config,
      audio
    }

    debugSpeechToText('Recognizing text from audio file...')

    try {
      const clientPromise = this.speechClient.recognize(request)
      const [response] = await timeoutFn(clientPromise, timeout)

      const transcription = response.results
        ?.map(result => {
          const alternative = result.alternatives[0]
          if (alternative.confidence >= this.config.confidenceThreshold) {
            return alternative.transcript
          }
        })
        .join('\n')

      if (!transcription) {
        debugSpeechToText('No text could be recognized')
      } else {
        debugSpeechToText('Text recognized:', `'${transcription}'`)
      }

      return transcription
    } catch (err) {
      if (err instanceof TimeoutError) {
        debugSpeechToText(`Recognition cancelled: ${err.message}`)
      } else {
        throw err
      }
    }
  }

  public async textToSpeech(
    text: string,
    language: string,
    timeout?: string
  ): Promise<Uint8Array | string | undefined> {
    debugTextToSpeech('Received text to convert into audio:', text)

    const request: ISynthesizeSpeechRequest = {
      input: { text },
      voice: { languageCode: this.languageCode(language), ssmlGender: this.config.voiceSelection },
      audioConfig: { audioEncoding: 'MP3' } // Always return .mp3 files since it's one of the most recognized audio file type
    }

    debugTextToSpeech('Producing audio content from text...')

    try {
      const clientPromise = this.textToSpeechClient.synthesizeSpeech(request)
      const [response] = await timeoutFn(clientPromise, timeout)

      if (!response.audioContent.length) {
        debugTextToSpeech('No audio content could be produced from the text received')
      } else {
        debugTextToSpeech('Audio content produced successfully')
      }

      return response.audioContent
    } catch (err) {
      if (err instanceof TimeoutError) {
        debugSpeechToText(`Audio production cancelled: ${err.message}`)
      } else {
        throw err
      }
    }
  }

  /**
   * Returns the closest BCP 47 language code based on a user language
   */
  private languageCode(language: string) {
    // Instead of doing a complete BCP 47 validation, we only make sure the language
    // contains an hyphen that separates the language code to the country code.
    if (language.includes('-')) {
      return language
    } else {
      return this.config.languageMapping[language] || 'en-US'
    }
  }
}
