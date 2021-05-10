const base = require('./_base')
const path = require('path')
const utils = require('./_utils')

function renderElement(data, channel) {
  return utils.extractPayload('location', data)
}

module.exports = {
  id: 'builtin_location',
  group: 'Built-in Messages',
  title: 'location',

  jsonSchema: {
    description: 'module.builtin.types.location.description',
    type: 'object',
    required: ['latitude', 'longitude'],
    properties: {
      latitude: {
        type: 'number',
        title: 'module.builtin.types.location.latitude'
      },
      longitude: {
        type: 'number',
        title: 'module.builtin.types.location.longitude'
      },
      address: {
        type: 'string',
        title: 'module.builtin.types.location.address'
      },
      title: {
        type: 'string',
        title: 'module.builtin.types.location.title'
      },
      ...base.typingIndicators
    }
  },

  uiSchema: {},

  computePreviewText: formData => `${formData.latitude}° ${formData.longitude}°`,

  renderElement: renderElement
}
