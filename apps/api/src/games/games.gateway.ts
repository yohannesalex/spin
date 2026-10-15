import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

/**
 * Real-time channel (Socket.IO). Broadcasts carry no player identities: the number grid shows
 * taken numbers only (spec §6.2), and each client knows its own number from the REST API.
 */
@WebSocketGateway({
  cors: { origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','), credentials: true },
})
export class GamesGateway implements OnGatewayInit {
  private log = new Logger('GamesGateway');
  @WebSocketServer() server: Server;

  afterInit() {
    this.log.log('Socket.IO ready');
  }

  @SubscribeMessage('lobby:subscribe')
  lobby(@ConnectedSocket() socket: Socket) {
    socket.join('lobby');
    return { ok: true };
  }

  @SubscribeMessage('game:subscribe')
  game(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId?: string }) {
    if (typeof body?.gameId === 'string' && /^[0-9a-f-]{36}$/i.test(body.gameId)) {
      for (const room of socket.rooms) if (room.startsWith('game:')) socket.leave(room);
      socket.join(`game:${body.gameId}`);
    }
    return { ok: true };
  }

  /** Clock sync for REQ-ANIM-02 (clients estimate offset from round-trip). */
  @SubscribeMessage('time')
  time() {
    return { serverTime: Date.now() };
  }

  toLobby(event: string, payload: unknown) {
    this.server?.to('lobby').emit(event, payload);
  }

  toGame(gameId: string, event: string, payload: unknown) {
    this.server?.to(`game:${gameId}`).emit(event, payload);
  }
}
