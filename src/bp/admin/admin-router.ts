import axios from 'axios'
import { Logger } from 'botpress/sdk'
import { checkRule } from 'common/auth'
import LicensingService from 'common/licensing-service'
import { ConfigProvider } from 'core/config/config-loader'
import { LogsRepository } from 'core/logger'
import { ModuleLoader } from 'core/modules'

import { CustomRouter } from 'core/routers/customRouter'
import { assertSuperAdmin, checkTokenHeader, sendSuccess } from 'core/routers/util'
import { GhostService } from 'core/services'
import { AlertingService } from 'core/services/alerting-service'
import { AuthStrategies } from 'core/services/auth-strategies'
import AuthService, { TOKEN_AUDIENCE } from 'core/services/auth/auth-service'
import { BotService } from 'core/services/bot-service'
import { JobService } from 'core/services/job-service'
import { MonitoringService } from 'core/services/monitoring'
import { WorkspaceService } from 'core/services/workspace-service'
import express, { RequestHandler, Router } from 'express'
import httpsProxyAgent from 'https-proxy-agent'
import _ from 'lodash'

import AuthRouter from './auth/auth-router'
import HealthRouter from './health/health-router'
import ManagementRouter from './management/management-router'
import UserRouter from './user/user-router'
import { fixMappingMw } from './utils/apiMapper'
import WorkspaceRouter from './workspace/workspace-router'

export interface AdminServices {
  logger: Logger
  authService: AuthService
  workspaceService: WorkspaceService
  botService: BotService
  moduleLoader: ModuleLoader
  configProvider: ConfigProvider
  ghostService: GhostService
  monitoringService: MonitoringService
  logsRepository: LogsRepository
  licensingService: LicensingService
  alertingService: AlertingService
  jobService: JobService
  authStrategies: AuthStrategies
}

class AdminRouter extends CustomRouter {
  private checkTokenHeader: RequestHandler
  private managementRouter: ManagementRouter
  private healthRouter: HealthRouter
  private workspaceRouter: WorkspaceRouter
  private authRouter: AuthRouter
  private userRouter: UserRouter

  constructor(
    logger: Logger,
    private authService: AuthService,
    workspaceService: WorkspaceService,
    botService: BotService,
    private licensingService: LicensingService,
    ghostService: GhostService,
    configProvider: ConfigProvider,
    monitoringService: MonitoringService,
    alertingService: AlertingService,
    moduleLoader: ModuleLoader,
    jobService: JobService,
    logsRepository: LogsRepository,
    authStrategies: AuthStrategies
  ) {
    super('Admin', logger, Router({ mergeParams: true }))
    this.checkTokenHeader = checkTokenHeader(this.authService, TOKEN_AUDIENCE)

    const adminServices: AdminServices = {
      logger,
      authService: this.authService,
      licensingService: this.licensingService,
      workspaceService,
      botService,
      moduleLoader,
      configProvider,
      ghostService,
      monitoringService,
      logsRepository,
      alertingService,
      jobService,
      authStrategies
    }

    this.managementRouter = new ManagementRouter(adminServices)
    this.healthRouter = new HealthRouter(adminServices)
    this.workspaceRouter = new WorkspaceRouter(adminServices)
    this.authRouter = new AuthRouter(adminServices)
    this.userRouter = new UserRouter(adminServices)
  }

  setupRoutes(app: express.Express) {
    // Redirect auth requests to the new router, since collaborators and chat users still need the admin ui to login
    app.use('/api/v1/auth', this.authRouter.router)

    // Rewrite old admin routes to the V2 version (slight changes in name only)
    app.use('/api/v1/admin', fixMappingMw, this.router)

    app.use('/api/v2/admin', this.router)

    this.router.use('/auth', this.authRouter.router)
    this.router.use('/management', this.checkTokenHeader, assertSuperAdmin, this.managementRouter.router)
    this.router.use('/health', this.checkTokenHeader, assertSuperAdmin, this.healthRouter.router)
    this.router.use('/workspace', this.checkTokenHeader, this.workspaceRouter.router)
    this.router.use('/user', this.checkTokenHeader, this.userRouter.router)

    this.router.get(
      '/ping',
      this.checkTokenHeader,
      this.asyncMiddleware(async (req, res) => {
        sendSuccess(res, 'Pong', { serverId: process.SERVER_ID })
      })
    )

    this.router.get(
      '/permissions',
      this.asyncMiddleware(async (req, res) => {
        const { permissions, operation, resource } = req.body
        const valid = checkRule(permissions, operation, resource)
        res.send(valid)
      })
    )

    this.router.get(
      '/all-permissions',
      this.asyncMiddleware(async (req, res) => {
        res.json(await this.authService.getResources())
      })
    )

    this.router.get('/license', (req, res) => {
      const license = {
        isPro: process.IS_PRO_ENABLED
      }
      res.send(license)
    })

    this.router.get(
      '/audit',
      this.asyncMiddleware(async (req, res) => {
        res.send(await this.licensingService.auditLicensing(req.headers['x-bp-audit'] as string))
      })
    )

    this.router.get(
      '/docker_images',
      this.asyncMiddleware(async (req, res) => {
        try {
          const { data } = await axios.get(
            'https://hub.docker.com/v2/repositories/botpress/server/tags/?page_size=125&page=1&name=v',
            process.PROXY ? { httpsAgent: new httpsProxyAgent(process.PROXY) } : {}
          )

          res.send(data)
        } catch (err) {
          res.send({ results: [] })
        }
      })
    )
  }
}

export default AdminRouter
