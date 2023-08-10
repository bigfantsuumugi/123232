import actions from './actions'
import * as botpress from '.botpress'

console.info('starting integration')

class NotImplementedError extends Error {
  constructor() {
    super('Not implemented')
  }
}

export default new botpress.Integration({
  register: async () => {
    /**
     * This is called when a bot installs the integration.
     * You should use this handler to instanciate ressources in the external service and ensure that the configuration is valid.
     */
  },
  unregister: async () => {
    /**
     * This is called when a bot removes the integration.
     * You should use this handler to instanciate ressources in the external service and ensure that the configuration is valid.
     */
  },
  actions,
  channels: {},
  handler: async () => {
    throw new NotImplementedError()
  },
})
