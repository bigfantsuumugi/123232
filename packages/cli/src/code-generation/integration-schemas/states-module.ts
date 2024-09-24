import * as utils from '../../utils'
import { jsonSchemaToTypeScriptType } from '../generators'
import { Module, ReExportTypeModule } from '../module'
import * as strings from '../strings'
import type * as types from '../typings'

export class StateModule extends Module {
  public constructor(name: string, private _state: types.integration.StateDefinition) {
    super({
      path: `${name}.ts`,
      exportName: strings.typeName(name),
    })
  }

  public async getContent() {
    const jsonSchema = utils.schema.mapZodToJsonSchema(this._state)
    return await jsonSchemaToTypeScriptType(jsonSchema, this.exportName)
  }
}

export class StatesModule extends ReExportTypeModule {
  public constructor(states: Record<string, types.integration.StateDefinition>) {
    super({ exportName: strings.typeName('states') })
    for (const [stateName, state] of Object.entries(states)) {
      const module = new StateModule(stateName, state)
      this.pushDep(module)
    }
  }
}
