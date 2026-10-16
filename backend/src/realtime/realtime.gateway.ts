import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import IORedis from 'ioredis';
import { loadEnv } from '../config/env';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokensService } from '../auth/tokens.service';
import { AdminPermissionsCache } from '../auth/admin-permissions.cache';
import { PrismaService } from '../prisma/prisma.service';
import { logger } from '../common/logger';

/**
 * Socket.IO realtime channel (§2, §7). Clients connect to `/realtime` with `auth: { token }`.
 * Rooms: `user:<userId>` (customer or driver), `admins` (admins with dashboard.view).
 * Push notifications are the backup channel when the socket is down.
 *
 * Server → client events:
 *  - `order.updated`        { order }                       to customer, driver, admins
 *  - `order.offer`          { offer }                       to a driver
 *  - `order.offer_revoked`  { orderId }                     to drivers who lost the race / order closed
 *  - `order.driver_location`{ orderId, lat, lng, at }       to the customer of an active order
 *  - `fleet.driver_location`{ driverId, lat, lng, online }  to admins
 *  - `wallet.updated`       { balanceToea }                 to a driver
 * Client → server:
 *  - `driver.location`      { lat, lng }  (drivers; same as POST /driver/location)
 */
@Injectable()
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server?: { to(room: string): { emit(ev: string, payload: unknown): void } } & Partial<Server>;

  private emitter?: Emitter;
  private emitterRedis?: IORedis;

  /** Set by DriversModule to avoid a circular import. */
  onDriverLocation?: (userId: string, lat: number, lng: number) => Promise<void>;

  constructor(
    private readonly tokens: TokensService,
    private readonly perms: AdminPermissionsCache,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth?.token as string) ?? String(client.handshake.headers.authorization ?? '').replace(/^Bearer /, '');
      const payload = await this.tokens.verifyAccess(token);
      if (payload.typ === 'admin') {
        if (!payload.mfa) throw new Error('mfa');
        const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
        if (!admin || admin.status !== 'active') throw new Error('inactive');
        const perms = await this.perms.forRole(admin.roleId);
        if (!perms.has('dashboard.view')) throw new Error('perm');
        await client.join('admins');
      } else {
        await client.join(`user:${payload.sub}`);
        if (payload.role === 'driver') {
          client.on('driver.location', async (msg: any) => {
            const lat = Number(msg?.lat);
            const lng = Number(msg?.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng) && this.onDriverLocation) {
              await this.onDriverLocation(payload.sub, lat, lng).catch((err) => logger.warn({ err: err.message }, 'ws location rejected'));
            }
          });
        }
      }
      client.data.sub = payload.sub;
    } catch {
      client.emit('error', { code: 'unauthorized' });
      client.disconnect(true);
    }
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.emit(`user:${userId}`, event, payload);
  }

  toAdmins(event: string, payload: unknown): void {
    this.emit('admins', event, payload);
  }

  /**
   * In API processes the server (with the Redis adapter) fans out to every instance. In the worker
   * process there is no socket server, so publish through the Redis emitter instead.
   */
  private emit(room: string, event: string, payload: unknown): void {
    if (this.server) {
      this.server.to(room).emit(event, payload);
      return;
    }
    if (process.env.JOBS_DRIVER === 'memory') return;
    if (!this.emitter) {
      const env = loadEnv();
      this.emitterRedis = new IORedis(env.redisUrl);
      this.emitter = new Emitter(this.emitterRedis, { key: `${env.redisPrefix}:socket.io` });
    }
    this.emitter.of('/realtime').to(room).emit(event, payload as any);
  }

  onModuleDestroy(): void {
    this.emitterRedis?.disconnect();
  }
}

@Global()
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
