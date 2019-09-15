import { routerReducer } from 'react-router-redux'
import { combineReducers } from 'redux'

import bots from './bots'
import license from './license'
import modules, { ModulesState } from './modules'
import monitoring from './monitoring'
import roles, { RoleState } from './roles'
import server from './server'
import user from './user'

export interface AppState {
  roles: RoleState
  modules: ModulesState
}

export default combineReducers<AppState>({
  routing: routerReducer,
  license,
  bots,
  user,
  roles,
  monitoring,
  modules,
  server
})
