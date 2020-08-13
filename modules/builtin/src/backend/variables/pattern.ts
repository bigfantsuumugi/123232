import { BoxedVariable, PrimitiveVarType } from 'botpress/sdk'
import { BaseVariable } from 'common/variables'

import common from './common'

class BoxedPattern extends BaseVariable<string> {
  constructor(args) {
    super(args)
  }

  trySet(value: string, confidence: number) {
    try {
      for (const regex of this.getValidationData().patterns) {
        if (regex.test(value)) {
          this._value = value
          this._confidence = confidence
          return
        }
      }

      this._confidence = 0
    } catch (err) {
      console.error("Value doesn't match pattern")
    }
  }
}

const PatternVariableType: PrimitiveVarType = {
  id: 'pattern',
  config: {
    label: 'pattern',
    icon: 'comparison',
    fields: [
      ...common.fields,
      {
        type: 'hidden',
        key: 'subType',
        label: 'subType'
      }
    ],
    advancedSettings: common.advancedSettings
  },
  box: BoxedPattern
}

export default PatternVariableType
