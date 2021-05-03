import * as sdk from 'botpress/sdk'
import { renderRecursive } from 'core/cms/templating'
import { injectable } from 'inversify'

const __unrendered = <T>(payload: T): T => {
  ;(<any>payload).__unrendered = true
  return payload
}

export enum ButtonAction {
  SaySomething = 'Say something',
  OpenUrl = 'Open URL',
  Postback = 'Postback'
}

@injectable()
export class RenderService {
  renderText(text: string | sdk.MultiLangText, markdown?: boolean): sdk.TextContent {
    return __unrendered({
      type: 'text',
      text,
      markdown
    })
  }

  renderImage(url: string, caption?: string | sdk.MultiLangText): sdk.ImageContent {
    return __unrendered({
      type: 'image',
      image: url,
      title: caption
    })
  }

  renderCard(
    title: string | sdk.MultiLangText,
    image?: string,
    subtitle?: string | sdk.MultiLangText,
    ...buttons: sdk.ActionButton[]
  ): sdk.CardContent {
    return __unrendered({
      type: 'card',
      title,
      image,
      subtitle,
      actions: buttons
    })
  }

  renderCarousel(...cards: sdk.CardContent[]): sdk.CarouselContent {
    return __unrendered({
      type: 'carousel',
      items: cards
    })
  }

  renderChoice(text: string | sdk.MultiLangText, ...choices: sdk.ChoiceOption[]): sdk.ChoiceContent {
    return __unrendered({
      type: 'single-choice',
      text,
      choices
    })
  }

  renderButtonSay(title: string, text: string | sdk.MultiLangText): sdk.ActionSaySomething {
    return {
      action: ButtonAction.SaySomething,
      title,
      text
    }
  }

  renderButtonUrl(title: string, url: string): sdk.ActionOpenURL {
    return {
      action: ButtonAction.OpenUrl,
      title,
      url
    }
  }

  renderButtonPostback(title: string, payload: string): sdk.ActionPostback {
    return {
      action: ButtonAction.Postback,
      title,
      payload
    }
  }

  renderOption(value: string, title?: string): sdk.ChoiceOption {
    return {
      value,
      title: title ?? value
    }
  }

  renderTranslated<T extends sdk.Content>(content: T, lang: string): T {
    if (typeof content !== 'object' || content === null) {
      return content
    }

    for (const [key, value] of Object.entries(content)) {
      if (key === lang) {
        return value
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = this.renderTranslated(value[i], lang)
        }
      } else {
        content[key] = this.renderTranslated(value, lang)
      }
    }

    return content
  }

  renderTemplate<T extends sdk.Content>(content: T, context): T {
    return renderRecursive(content, context)
  }

  getPipeline(lang: string, context: any): sdk.RenderPipeline {
    const wrap = <T extends Array<any>, U>(fn: (...args: T) => U) => {
      return (...args: T): U => {
        const content = fn(...args)
        const translated = this.renderTranslated(<any>content, lang)
        return this.renderTemplate(translated, context)
      }
    }

    return {
      text: wrap(this.renderText),
      image: wrap(this.renderImage),
      card: wrap(this.renderCard),
      carousel: wrap(this.renderCarousel),
      choice: wrap(this.renderChoice),
      buttonSay: wrap(this.renderButtonSay),
      buttonUrl: wrap(this.renderButtonUrl),
      buttonPostback: wrap(this.renderButtonPostback),
      option: wrap(this.renderOption)
    }
  }
}
