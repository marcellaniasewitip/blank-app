import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { loadEnv } from '../config/env';

/**
 * Socket.IO over Redis pub/sub so an event emitted by any API instance — or by the worker process via
 * the Redis emitter — reaches clients connected to every instance behind the load balancer.
 */
export class RedisIoAdapter extends IoAdapter {
  private pub?: IORedis;
  private sub?: IORedis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    const env = loadEnv();
    this.pub = new IORedis(env.redisUrl);
    this.sub = this.pub.duplicate();
    server.adapter(createAdapter(this.pub, this.sub, { key: `${env.redisPrefix}:socket.io` }));
    return server;
  }

  async close(server: any): Promise<void> {
    await super.close(server);
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
