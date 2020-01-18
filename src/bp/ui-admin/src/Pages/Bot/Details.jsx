import React, { Component, Fragment } from 'react'

import { MdInfoOutline } from 'react-icons/md'
import { connect } from 'react-redux'

import { BotEditSchema } from 'common/validation'
import Joi from 'joi'
import Select from 'react-select'
import { Row, Col, FormGroup, Label, Input, Form, UncontrolledTooltip, Collapse } from 'reactstrap'
import { MdKeyboardArrowUp, MdKeyboardArrowDown } from 'react-icons/md'
import { generatePath } from 'react-router'
import { getActiveWorkspace } from '~/Auth'
import _ from 'lodash'

import { fetchBots, fetchBotCategories } from '../../reducers/bots'
import { fetchLicensing } from '../../reducers/license'
import { fetchLanguages } from '../../reducers/server'

import api from '../../api'
import PageContainer from '~/App/PageContainer'
import StickyActionBar from '~/App/StickyActionBar'
import AlertBanner from '~/App/AlertBanner'
import { Button, Intent } from '@blueprintjs/core'

const statusList = [
  { label: 'Published', value: 'public' },
  { label: 'Collaborators Only', value: 'private' },
  { label: 'Unmounted', value: 'disabled' }
]

class Bots extends Component {
  state = {
    id: '',
    name: '',
    avatarUrl: '',
    coverPictureUrl: '',
    category: undefined,
    description: '',
    website: '',
    phoneNumber: '',
    termsConditions: '',
    emailAddress: '',
    error: undefined,
    categories: [],
    moreOpen: false,
    languages: [],
    defaultLanguage: undefined,
    formHasChanged: false,
    isSaving: false
  }

  componentDidMount() {
    if (!this.props.botCategoriesFetched) {
      this.props.fetchBotCategories()
    }

    if (!this.props.licensing) {
      this.props.fetchLicensing()
    }

    if (!this.props.languages) {
      this.props.fetchLanguages()
    }

    this.props.fetchBots()
    this.prepareCategories()
  }

  componentDidUpdate(prevProps) {
    if (prevProps.bots !== this.props.bots) {
      this.loadBot()
    }
    if (prevProps.botCategories !== this.props.botCategories) {
      this.prepareCategories()
    }
    if (prevProps.languages !== this.props.languages) {
      this.updateLanguages()
    }
  }

  prepareCategories = () => {
    if (this.props.botCategories) {
      this.setState({ categories: this.props.botCategories.map(cat => ({ label: cat, value: cat })) })
    }
  }

  sortLanguages = (a, b) => {
    const langA = a.name.toUpperCase();
    const langB = b.name.toUpperCase();

    return (langA < langB) ? -1 : (langA > langB) ? 1 : 0;
  }

  updateLanguages = () => {
    if (!this.props.languages) {
      return
    }

    // [TODO] max.cloutier 2020.01.17 should this be done on the backend side or is there a logic to this order? Just drove me nuts, had to sort it...
    const languagesList = this.props.languages.sort(this.sortLanguages).map(lang => ({
      label: lang.name,
      value: lang.code
    }))

    this.setState({
      languagesList,
      selectedLanguages: languagesList.filter(x => (this.state.languages || []).includes(x.value)),
      selectedDefaultLang: languagesList.find(x => x.value === this.state.defaultLanguage)
    })
  }

  loadBot() {
    const botId = this.props.match.params.botId
    this.bot = this.props.bots.find(bot => bot.id === botId)

    const status = this.bot.disabled ? 'disabled' : this.bot.private ? 'private' : 'public'
    const details = _.get(this.bot, 'details', {})

    this.setState(
      {
        botId,
        name: this.bot.name,
        description: this.bot.description,
        languages: this.bot.languages || [],
        defaultLanguage: this.bot.defaultLanguage,
        website: details.website,
        phoneNumber: details.phoneNumber,
        termsConditions: details.termsConditions,
        privacyPolicy: details.privacyPolicy,
        emailAddress: details.emailAddress,
        status: statusList.find(x => x.value === status),
        category: this.state.categories.find(x => x.value === this.bot.category),
        avatarUrl: details.avatarUrl || '',
        coverPictureUrl: details.coverPictureUrl || ''
      },
      this.updateLanguages
    )
  }

  cancel = () => {
    if (this.state.formHasChanged) {
      // [TODO] max.cloutier 2020.01.17 Implement and use a custom confirm popup and replace the window.confirm in this file/app-wide
      const conf = window.confirm(`There are unsaved changes in this form. Are you sure you want to cancel?`)

      if (conf) {
        this.backToList()
      }
    } else {
      this.backToList()
    }
  }

  backToList = () => {
    const workspaceId = getActiveWorkspace()

    this.props.history.push(generatePath('/workspace/:workspaceId?/bots', { workspaceId: workspaceId || undefined }))
  }

  saveChanges = async () => {
    this.setState({ error: undefined, isSaving: true })

    const { selectedLanguages, selectedDefaultLang, category } = this.state

    const bot = {
      name: this.state.name,
      description: this.state.description,
      category: category && category.value,
      defaultLanguage: selectedDefaultLang && selectedDefaultLang.value,
      languages: selectedLanguages && selectedLanguages.map(x => x.value),
      details: {
        website: this.state.website,
        phoneNumber: this.state.phoneNumber,
        termsConditions: this.state.termsConditions,
        emailAddress: this.state.emailAddress,
        avatarUrl: this.state.avatarUrl,
        coverPictureUrl: this.state.coverPictureUrl,
        privacyPolicy: this.state.privacyPolicy
      }
    }

    const status = this.state.status && this.state.status.value
    bot.disabled = status === 'disabled' && bot.defaultLanguage === this.bot.defaultLanguage //force enable if language changed
    bot.private = status === 'private'

    const { error } = Joi.validate(bot, BotEditSchema)
    if (error) {
      this.setState({ error: error })
      return
    }

    await api
      .getSecured()
      .post(`/admin/bots/${this.state.botId}`, bot)
      .catch(err => this.setState({ error: err }))

    await this.props.fetchBots()

    this.setState({ successMsg: `Bot configuration updated successfully, you will be redirected to the bots list.` })

    window.setTimeout(() => {
      this.backToList()
    }, 2000)
  }

  toggleMoreOpen = () => {
    this.setState({
      moreOpen: !this.state.moreOpen
    })
  }

  renderHelp(text, id) {
    return (
      <span>
        <MdInfoOutline id={`help${id}`} className="section-title-help" />
        <UncontrolledTooltip placement="right" target={`help${id}`}>
          {text}
        </UncontrolledTooltip>
      </span>
    )
  }

  handleInputChanged = event => this.setState({ [event.target.name]: event.target.value, formHasChanged: true })
  handleStatusChanged = status => this.setState({ status, formHasChanged: true })
  handleCategoryChanged = category => this.setState({ category, formHasChanged: true })

  handleDefaultLangChanged = lang => {
    if (!this.state.selectedDefaultLang) {
      this.setState({ selectedDefaultLang: lang, formHasChanged: true })
      return
    }

    if (this.state.selectedDefaultLang !== lang) {
      const conf = window.confirm(
        `Are you sure you want to change the language of your bot from ${this.state.selectedDefaultLang.label} to ${
        lang.label
        }? All of your content elements will be copied, make sure you translate them.`
      )

      if (conf) {
        this.setState({ selectedDefaultLang: lang, formHasChanged: true })
      }
    }
  }

  handleLanguagesChanged = langs => {
    this.setState({ selectedLanguages: langs, formHasChanged: true })
  }

  handleCommunityLanguageChanged = lang => {
    this.setState({ selectedDefaultLang: lang, selectedLanguages: [lang], formHasChanged: true })
  }

  handleImageFileChanged = async event => {
    const targetProp = event.target.name
    if (!event.target.files) {
      return
    }

    if (!event.target.files[0].type.includes('image/')) {
      this.setState({
        error: `${targetProp} requires an image file`
      })
      return
    }

    const data = new FormData()
    data.append('file', event.target.files[0])

    if (this.state.error) {
      this.setState({ error: null })
    }

    // [TODO] max.cloutier 2020.01.17 Add indications that this will submit the form OR change the behavior so it saves only on save btn click
    // If it can't be uploaded without saving, it should probably be a dedicated option that isn't part of this form
    await api
      .getSecured()
      .post(`/bots/${this.state.botId}/media`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(response => {
        this.setState({ [targetProp]: response.data.url }, this.saveChanges)
      })
      .catch(err => {
        this.setState({ error: err })
      })
  }

  renderLanguages = () => {
    if (this.props.licensing && this.props.licensing.isPro) {
      return (
        <Row>
          <Col md={6}>
            <FormGroup>
              <Label for="sup-lang">
                <strong>Supported Languages</strong>
                {this.renderHelp('Your bot can support different languages, select desired languages', 'sup-lang')}
              </Label>
              <Select
                options={this.state.languagesList}
                isMulti
                value={this.state.selectedLanguages}
                onChange={this.handleLanguagesChanged}
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <FormGroup>
              <Label>
                <strong>Default language</strong>
                {this.renderHelp(
                  'Choose the default language for your bot. First of supported language is picked by default.',
                  'def-lang'
                )}
              </Label>
              <Select
                options={this.state.languagesList}
                value={this.state.selectedDefaultLang}
                onChange={this.handleDefaultLangChanged}
              />
            </FormGroup>
          </Col>
        </Row>
      )
    } else {
      return (
        <FormGroup>
          <Label for="sup-lang">
            <strong>Language</strong>
            {this.renderHelp('Choose desired language among those', 'sup-lang')}
          </Label>
          <Select
            options={this.state.languagesList}
            value={this.state.selectedLanguages}
            onChange={this.handleCommunityLanguageChanged}
          />
        </FormGroup>
      )
    }
  }

  renderDetails() {
    const {
      categories,
      category,
      description,
      error,
      name,
      status,
      successMsg
    } = this.state;
    return (
      <div>
        {error && <AlertBanner type="error" hide={() => this.setState({ error: null })}>{error.message}</AlertBanner>}
        {successMsg && <AlertBanner type="success" hideCloseBtn={true} hide={() => this.setState({ successMsg: '' })}>{successMsg}</AlertBanner>}
        <Form>
          <Row form>
            <Col md={5}>
              <FormGroup>
                <Label for="name">
                  <strong>Name</strong>
                </Label>
                <Input
                  id="input-name"
                  type="text"
                  name="name"
                  value={name}
                  onChange={this.handleInputChanged}
                />
              </FormGroup>
            </Col>
            <Col md={4}>
              {!!categories.length && (
                <FormGroup>
                  <Label>
                    <strong>Category</strong>
                  </Label>
                  <Select
                    id="select-category"
                    options={categories}
                    value={category}
                    onChange={this.handleCategoryChanged}
                  />
                </FormGroup>
              )}
            </Col>
            <Col md={3}>
              <FormGroup>
                <Label for="status">
                  <strong>Status</strong>
                  {this.renderHelp(
                    `Public bots can be accessed by anyone, while private are only accessible by authenticated users.
                Please note that private bots cannot be embedded on a website.
                This should only be used for testing purposes while developing or if you access it directly using shortlinks`
                  )}
                </Label>
                <Select
                  id="select-status"
                  options={statusList}
                  value={status}
                  onChange={this.handleStatusChanged}
                  isSearchable={false}
                />
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label for="description">
              <strong>Description</strong>
            </Label>
            <Input
              id="input-description"
              type="textarea"
              name="description"
              value={description}
              onChange={this.handleInputChanged}
            />
          </FormGroup>
          {this.renderLanguages()}
        </Form>

        {this.renderCollapsible()}
      </div>
    )
  }

  renderMoreDetails() {
    return (
      <Fragment>
        <Row form>
          <Col md={4}>
            <FormGroup>
              <Label for="website">
                <strong>Website</strong>
              </Label>
              <Input
                id="input-website"
                type="text"
                name="website"
                value={this.state.website || ''}
                onChange={this.handleInputChanged}
              />
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup>
              <Label for="phoneNumber">
                <strong>Phone Number</strong>
              </Label>
              <Input
                id="input-phone"
                type="text"
                name="phoneNumber"
                value={this.state.phoneNumber || ''}
                onChange={this.handleInputChanged}
              />
            </FormGroup>
          </Col>
          <Col md={4}>
            <FormGroup>
              <Label for="emailAddress">
                <strong>Contact E-mail</strong>
              </Label>
              <Input
                id="input-email"
                type="text"
                name="emailAddress"
                value={this.state.emailAddress || ''}
                onChange={this.handleInputChanged}
              />
            </FormGroup>
          </Col>
        </Row>
        <Row form>
          <Col md={6}>
            <FormGroup>
              <Label for="termsConditions">
                <strong>Link to Terms & Conditions</strong>
              </Label>
              <Input
                id="input-termsConditions"
                type="text"
                name="termsConditions"
                value={this.state.termsConditions || ''}
                onChange={this.handleInputChanged}
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <FormGroup>
              <Label for="termsConditions">
                <strong>Link to Privacy Policy</strong>
              </Label>
              <Input
                type="text"
                id="input-privacyPolicy"
                name="privacyPolicy"
                value={this.state.privacyPolicy || ''}
                onChange={this.handleInputChanged}
              />
            </FormGroup>
          </Col>
        </Row>
        <small>
          This information is displayed on the Bot Information page,{' '}
          <a href="https://botpress.io/docs/tutorials/webchat-embedding" target="_blank" rel="noopener noreferrer">
            check the documentation for more details
      </a>
        </small>
      </Fragment>
    )
  }

  renderPictures() {
    // [TODO] max.cloutier 2020.01.17 functional, but the style of this section should be revisited
    return (
      <Fragment>
        <Row>
          <Col md={6}>
            <Label>
              <strong>Bot Avatar</strong>
            </Label>
            <Input type="file" accept="image/*" name="avatarUrl" onChange={this.handleImageFileChanged} />
            {this.state.avatarUrl && <img height={75} alt="avatar" src={this.state.avatarUrl} />}
          </Col>
          <Col md={6}>
            <Label>
              <strong>Cover Picture</strong>
            </Label>
            <Input type="file" accept="image/*" name="coverPictureUrl" onChange={this.handleImageFileChanged} />
            {this.state.coverPictureUrl && <img style={{ width: 'auto', maxWidth: '100%' }} alt="cover" src={this.state.coverPictureUrl} />}
          </Col>
        </Row>
      </Fragment>
    )
  }

  renderCollapsible() {
    return (
      <div className="bp_users-container">
        <div>
          <div
            onClick={() => this.setState({ moreCollapsed: !this.state.moreCollapsed })}
            className="bp_users-role_header"
          >
            <div className="role float-left">
              <span className="title">More details</span>
            </div>
            {this.state.moreCollapsed ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
          </div>
        </div>

        <Collapse isOpen={this.state.moreCollapsed}>
          <div style={{ padding: 15 }}>{this.renderMoreDetails()}</div>
        </Collapse>

        <div>
          <div
            onClick={() => this.setState({ avatarCollapsed: !this.state.avatarCollapsed })}
            className="bp_users-role_header"
          >
            <div className="role float-left">
              <span className="title">Pictures</span>
            </div>
            {this.state.avatarCollapsed ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
          </div>
        </div>

        <Collapse isOpen={this.state.avatarCollapsed}>
          <div style={{ padding: 15 }}>{this.renderPictures()}</div>
        </Collapse>
      </div>
    )
  }

  render() {
    return (
      <PageContainer
        contentClassName="with-sticky-action-bar"
        title={`Bot - ${this.state.name || this.state.botId}`}
        helpText="This page shows the details you can configure for a desired bot."
      >
        {this.renderDetails()}
        <StickyActionBar>
          <Button
            id="btn-cancel"
            intent={Intent.NONE}
            text="Cancel"
            disabled={this.state.isSaving}
            onClick={this.cancel}
          />
          <Button
            id="btn-save"
            intent={Intent.PRIMARY}
            icon="floppy-disk"
            text="Save changes"
            disabled={this.state.isSaving}
            onClick={this.saveChanges}
          />
        </StickyActionBar>
      </PageContainer>
    )
  }
}

const mapStateToProps = state => ({
  bots: state.bots.bots,
  botCategories: state.bots.botCategories,
  botCategoriesFetched: state.bots.botCategoriesFetched,
  licensing: state.license.licensing,
  languages: state.server.languages
})

const mapDispatchToProps = {
  fetchBots,
  fetchBotCategories,
  fetchLicensing,
  fetchLanguages
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Bots)
