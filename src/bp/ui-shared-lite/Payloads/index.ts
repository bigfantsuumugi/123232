import * as sdk from 'botpress/sdk'
import omit from 'lodash/omit'

const isBpUrl = (str: string): boolean => {
  const re = /^\/api\/.*\/bots\/.*\/media\/.*/g

  return re.test(str)
}

// Duplicate of modules/builtin/src/content-types/_utils.js
const formatUrl = (baseUrl: string, url: string): string => {
  if (isBpUrl(url)) {
    return `${baseUrl}${url}`
  } else {
    return url
  }
}

export const renderPayload = payload => {
  const type = payload?.type

  if (type === 'single-choice' && payload.choices) {
    return renderChoicePayload(payload)
  } else if (type === 'dropdown') {
    return renderDropdownPayload(payload)
  } else if (type === 'image' && payload.image) {
    return renderImagePayload(payload)
  } else if (type === 'audio' && payload.audio) {
    return renderAudioPayload(payload)
  } else if (type === 'video' && payload.video) {
    return renderVideoPayload(payload)
  } else if (type === 'file' && payload.file) {
    return renderFilePayload(payload)
  } else if (type === 'card') {
    return renderCarouselPayload({ ...payload, items: [payload] })
  } else if (type === 'carousel' && payload.items) {
    return renderCarouselPayload(payload)
  }

  return payload
}

const renderChoicePayload = (content: sdk.ChoiceContent) => {
  if ((content as any).isDropdown) {
    return {
      type: 'custom',
      module: 'extensions',
      component: 'Dropdown',
      message: content.text,
      buttonText: '',
      displayInKeyboard: true,
      options: content.choices.map(c => ({ label: c.title, value: c.value.toUpperCase() })),
      width: 300,
      placeholderText: (content as any).dropdownPlaceholder
    }
  }
  return {
    type: 'custom',
    module: 'channel-web',
    component: 'QuickReplies',
    quick_replies: content.choices.map(c => ({
      title: c.title,
      payload: c.value.toUpperCase()
    })),
    disableFreeText: (content as any).disableFreeText,
    wrapped: {
      type: 'text',
      ...omit(content, 'choices', 'type')
    }
  }
}

const renderDropdownPayload = (content: any) => {
  // TODO: add typings for dropdowns
  return {
    type: 'custom',
    module: 'extensions',
    component: 'Dropdown',
    ...content
  }
}

const renderImagePayload = (content: sdk.ImageContent) => {
  return {
    type: 'file',
    title: content.title,
    url: formatUrl('', content.image),
    collectFeedback: (content as any).collectFeedback
  }
}

const renderAudioPayload = (content: sdk.AudioContent) => {
  return {
    type: 'audio',
    title: content.title,
    url: formatUrl('', content.audio),
    collectFeedback: (content as any).collectFeedback
  }
}

const renderVideoPayload = (content: sdk.VideoContent) => {
  return {
    type: 'video',
    title: content.title,
    url: formatUrl('', content.video),
    collectFeedback: (content as any).collectFeedback
  }
}

const renderFilePayload = (content: any) => {
  return {
    type: 'video',
    title: content.title,
    url: formatUrl('', content.file),
    collectFeedback: content.collectFeedback
  }
}

const renderCarouselPayload = (content: sdk.CarouselContent) => {
  return {
    text: ' ',
    type: 'carousel',
    collectFeedback: (content as any).collectFeedback,
    elements: content.items.map(card => ({
      title: card.title,
      picture: card.image ? formatUrl('', card.image) : null,
      subtitle: card.subtitle,
      buttons: (card.actions || []).map(a => {
        if (a.action === 'Say something') {
          return {
            type: 'say_something',
            title: a.title,
            text: (a as sdk.ActionSaySomething).text
          }
        } else if (a.action === 'Open URL') {
          return {
            type: 'open_url',
            title: a.title,
            url: (a as sdk.ActionOpenURL)?.url.replace('BOT_URL', '')
          }
        } else if (a.action === 'Postback') {
          return {
            type: 'postback',
            title: a.title,
            payload: (a as sdk.ActionPostback).payload
          }
        } else {
          throw new Error(`Webchat carousel does not support "${a.action}" action-buttons at the moment`)
        }
      })
    }))
  }
}
