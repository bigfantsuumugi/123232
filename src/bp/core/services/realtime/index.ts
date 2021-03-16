import { IO, Logger, RealTimePayload } from 'botpress/sdk'
import cookie from 'cookie'
import { BotpressConfig } from 'core/config/botpress.config'
import { ConfigProvider } from 'core/config/config-loader'
import { EventEmitter2 } from 'eventemitter2'
import { Server } from 'http'
import { inject, injectable, tagged } from 'inversify'
import _ from 'lodash'
import socketio, { Adapter } from 'socket.io'
import redisAdapter from 'socket.io-redis'
import socketioJwt from 'socketio-jwt'
import { TYPES } from '../../types'
import AuthService from '../auth/auth-service'
import { MonitoringService } from '../monitoring'

const debug = DEBUG('realtime')

export const getSocketTransports = (config: BotpressConfig): string[] => {
  // Just to be sure there is at least one valid transport configured
  const transports = _.filter(config.httpServer.socketTransports, t => ['websocket', 'polling'].includes(t))
  return transports && transports.length ? transports : ['websocket', 'polling']
}

interface RedisAdapter extends Adapter {
  remoteJoin: (socketId: string, roomId: string, callback: (err: any) => void) => void
}

@injectable()
export default class RealtimeService {
  private readonly ee: EventEmitter2
  private useRedis: boolean
  private guest?: socketio.Namespace

  constructor(
    @inject(TYPES.Logger)
    @tagged('name', 'Realtime')
    private logger: Logger,
    @inject(TYPES.MonitoringService) private monitoringService: MonitoringService,
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider,
    @inject(TYPES.AuthService) private authService: AuthService
  ) {
    this.ee = new EventEmitter2({
      wildcard: true,
      maxListeners: 100
    })

    this.useRedis = process.CLUSTER_ENABLED && Boolean(process.env.REDIS_URL) && process.IS_PRO_ENABLED
  }

  private isEventTargeted(eventName: string | string[]): boolean {
    if (_.isArray(eventName)) {
      eventName = eventName[0]
    }

    return (eventName as string).startsWith('guest.')
  }

  private makeVisitorRoomId(visitorId: string): string {
    return `visitor:${visitorId}`
  }

  private unmakeVisitorId(roomId: string): string {
    return roomId.split(':')[1]
  }

  sendToSocket(payload: RealTimePayload) {
    debug('Send %o', payload)
    this.ee.emit(payload.eventName, payload.payload, 'server')
  }

  getVisitorIdFromSocketId(socketId: string): undefined | string {
    const socket = this.guest?.sockets[socketId]
    if (!socket) {
      return
    }
    // might have to use .allRooms or something like that for the redis adapter
    const roomId = Object.keys(socket.adapter.sids[socketId] || {}).filter(x => x !== socketId)[0]
    return roomId ? this.unmakeVisitorId(roomId) : undefined
  }

  async installOnHttpServer(server: Server) {
    const transports = getSocketTransports(await this.configProvider.getBotpressConfig())

    const io: socketio.Server = socketio(server, {
      transports,
      path: `${process.ROOT_PATH}/socket.io`,
      origins: '*:*',
      serveClient: false
    })

    if (this.useRedis) {
      const redisFactory = this.monitoringService.getRedisFactory()

      if (redisFactory) {
        io.adapter(redisAdapter({ pubClient: redisFactory('commands'), subClient: redisFactory('socket') }))
      }
    }

    const admin = io.of('/admin')
    this.setupAdminSocket(admin)

    const guest = io.of('/guest')
    this.setupGuestSocket(guest)

    this.ee.onAny((event, payload, from) => {
      if (from === 'client') {
        return // This is coming from the client, we don't send this event back to them
      }

      const connection = this.isEventTargeted(event) ? guest : admin

      if (payload && (payload.__socketId || payload.__room)) {
        // Send only to this socketId or room
        return connection.to(payload.__socketId || payload.__room).emit('event', {
          name: event,
          data: payload
        })
      }

      // broadcast event to the front-end clients
      connection.emit('event', { name: event, data: payload })
    })
  }

  checkCookieToken = async (socket: socketio.Socket, fn: (err?) => any) => {
    try {
      const csrfToken = socket.handshake.query.token
      const { jwtToken } = cookie.parse(socket.handshake.headers.cookie)

      if (jwtToken && csrfToken) {
        await this.authService.checkToken(jwtToken, csrfToken)
        fn(undefined)
      }

      fn('Mandatory parameters are missing')
    } catch (err) {
      fn(err)
    }
  }

  setupAdminSocket(admin: socketio.Namespace): void {
    if (process.USE_JWT_COOKIES) {
      admin.use(this.checkCookieToken)
    } else {
      admin.use(socketioJwt.authorize({ secret: process.APP_SECRET, handshake: true }))
    }

    admin.on('connection', socket => {
      const visitorId = _.get(socket, 'handshake.query.visitorId')

      socket.on('event', event => {
        try {
          if (!event || !event.name) {
            return
          }

          this.ee.emit(event.name, event.data, 'client', {
            visitorId,
            socketId: socket.id,
            guest: false,
            admin: true
          })
        } catch (err) {
          this.logger.attachError(err).error('Error processing incoming admin event')
        }
      })
    })
  }

  setupGuestSocket(guest: socketio.Namespace): void {
    this.guest = guest
    guest.on('connection', socket => {
      const visitorId = _.get(socket, 'handshake.query.visitorId')

      if (visitorId && visitorId.length > 0) {
        const roomId = this.makeVisitorRoomId(visitorId)
        if (this.useRedis) {
          const adapter = guest.adapter as RedisAdapter
          adapter.remoteJoin(socket.id, roomId, err => {
            if (err) {
              return this.logger
                .attachError(err)
                .error(`socket "${socket.id}" for visitor "${visitorId}" can't join the socket.io redis room`)
            }
          })
        } else {
          // if we don't like the SIDs getter we can use CORE_EVENT to emit and implement caching in channel-web
          // this would be duplicated code as caching is handled by socket IO and it's redis adapter counterpart
          socket.join(roomId)
        }
      }

      socket.on('event', event => {
        try {
          if (!event || !event.name) {
            return
          }

          this.ee.emit(event.name, event.data, 'client', {
            socketId: socket.id,
            visitorId,
            guest: true,
            admin: false
          })
        } catch (err) {
          this.logger.attachError(err).error('Error processing incoming guest event')
        }
      })
    })
  }
}
