import { Global, Injectable, Module } from '@nestjs/common';
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
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server?: { to(room: string): { emit(ev: string, payload: unknown): void } } & Partial<Server>;

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
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toAdmins(event: string, payload: unknown): void {
    this.server?.to('admins').emit(event, payload);
  }
}

@Global()
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
