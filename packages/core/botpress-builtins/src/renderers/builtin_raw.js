'use strict'

export default data =>
  data.items.map(item => ({
    ...JSON.parse(item.payload),
    messagingType: item.messagingType,
    tag: item.messagingTag,
    typing: item.typing
  }))