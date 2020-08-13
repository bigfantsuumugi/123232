import { BotEvent, FlowVariable, FormData, FormField } from 'botpress/sdk'
import { Variables } from 'common/typings'

export interface InvalidField {
  field: string
  message: string
}

export interface FormProps {
  axios?: any
  currentLang?: string
  mediaPath?: string
  overrideFields?: { [field: string]: (props: any) => JSX.Element }
  fields: FormField[]
  advancedSettings?: FormField[]
  formData?: FormData
  onUpdate: (data: { [key: string]: any }) => void
  onUpdateVariables?: (variable: FlowVariable) => void
  variables?: Variables
  invalidFields?: InvalidField[]
  superInputOptions?: {
    enabled?: boolean
    eventsOnly?: boolean
    variablesOnly?: boolean
  }
  events?: BotEvent[]
}
