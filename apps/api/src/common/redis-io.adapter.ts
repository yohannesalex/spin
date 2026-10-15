import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Socket.IO with the Redis adapter so broadcasts reach clients on every API instance. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string) {
    const pub = new Redis(url);
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
    new Logger('RedisIoAdapter').log('Socket.IO Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
