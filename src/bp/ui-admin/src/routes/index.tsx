import { Button } from '@blueprintjs/core'
import React from 'react'
import { Provider } from 'react-redux'
import { Redirect, Route, Switch } from 'react-router-dom'
import { ConnectedRouter } from 'react-router-redux'
import ChatAuthResult from '~/Pages/Account/ChatAuthResult'
import { LoginContainer } from '~/Pages/Layouts/LoginContainer'
import Alerting from '~/Pages/Server/Alerting'
import Checklist from '~/Pages/Server/Checklist'
import Languages from '~/Pages/Server/Languages'
import LatestReleases from '~/Pages/Server/LatestReleases'
import LicenseStatus from '~/Pages/Server/LicenseStatus'
import Monitoring from '~/Pages/Server/Monitoring'
import Versioning from '~/Pages/Server/Versioning'
import Workspaces from '~/Pages/Workspaces'

import store, { history } from '../store'
import { extractCookie } from '../utils/cookies'
import App from '../App/Layout'
import Auth, { getActiveWorkspace } from '../Auth'
import ChangePassword from '../Pages/Account/ChangePassword'
import LoginPage from '../Pages/Account/Login'
import RegisterPage from '../Pages/Account/Register'
import Bot from '../Pages/Bot'
import Confusion from '../Pages/Confusion'
import Debug from '../Pages/Server/Debug'
import Modules from '../Pages/Server/Modules'
import Workspace from '../Pages/Workspace'

import PrivateRoute from './PrivateRoute'

export const makeMainRoutes = () => {
  const auth = new Auth()

  const ExtractToken = () => {
    auth.setSession({ expiresIn: 7200, idToken: extractCookie('userToken') })
    // tslint:disable-next-line: no-floating-promises
    auth.afterLoginRedirect()

    return null
  }

  const NoAccess = () => {
    return (
      <LoginContainer subtitle={<strong>No access</strong>}>
        <p>Sorry, you do not have access to any workspace.</p>
        <Button text="Logout" onClick={auth.logout} />
      </LoginContainer>
    )
  }

  return (
    <Provider store={store}>
      <ConnectedRouter history={history}>
        <Switch>
          <Route path="/login/:strategy?/:workspace?" render={props => <LoginPage auth={auth} {...props} />} />
          <Route path="/register/:strategy?/:workspace?" render={props => <RegisterPage auth={auth} {...props} />} />
          <Route path="/setToken" component={ExtractToken} />
          <Route path="/changePassword" render={props => <ChangePassword auth={auth} {...props} />} />
          <Route path="/noAccess" component={NoAccess} />
          <Route path="/chatAuthResult" component={ChatAuthResult} />
          <PrivateRoute path="/" auth={auth} component={App}>
            <Switch>
              <Route path="/checklist" component={Checklist} />
              <Route path="/confusion" component={Confusion} />
              <Route path="/latestReleases" component={LatestReleases} />
              <Route path="/server/monitoring" component={Monitoring} />
              <Route path="/server/version" component={Versioning} />
              <Route path="/server/languages" component={Languages} />
              <Route path="/server/debug" component={Debug} />
              <Route path="/server/license" component={LicenseStatus} />
              <Route path="/server/alerting" component={Alerting} />
              <Route path="/workspace/:workspaceId?" component={Workspace} />
              <Route path="/workspaces" component={Workspaces} />
              <Route path="/bot" component={Bot} />
              <Route path="/debug" component={Debug} />
              <Route path="/modules" component={Modules} />
              <Route path="/" render={() => <Redirect from="/" to={`/workspace/${getActiveWorkspace()}/bots`} />} />
            </Switch>
          </PrivateRoute>
        </Switch>
      </ConnectedRouter>
    </Provider>
  )
}
