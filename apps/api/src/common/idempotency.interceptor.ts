import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

export const IDEMPOTENT = 'idempotent';
/** REQ-SEC-02: a repeated request with the same Idempotency-Key header replays the first response. */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ctx.getHandler())) return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = String(req.headers['idempotency-key'] || '').slice(0, 100);
    const userId = req.user?.id;
    if (!key || !userId) return next.handle();
    const route = `${req.method} ${req.route?.path}`;

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
    if (existing) {
      if (existing.route !== route) throw new ConflictException('Idempotency key reused for a different request');
      if (existing.statusCode === 0) throw new ConflictException('Request already in progress');
      res.status(existing.statusCode);
      if (existing.statusCode >= 400) throw new HttpException(existing.response as object, existing.statusCode);
      return of(existing.response);
    }
    try {
      await this.prisma.idempotencyKey.create({ data: { userId, key, route, statusCode: 0, response: {} } });
    } catch {
      throw new ConflictException('Request already in progress');
    }

    const save = (statusCode: number, response: unknown) =>
      this.prisma.idempotencyKey.update({
        where: { userId_key: { userId, key } },
        data: { statusCode, response: JSON.parse(JSON.stringify(response ?? null)) ?? {} },
      });

    return next.handle().pipe(
      mergeMap((body) => from(save(res.statusCode || 200, body).then(() => body))),
      catchError((err) => {
        // Business errors are replayed; unexpected errors free the key so the client can retry.
        const p =
          err instanceof HttpException
            ? save(err.getStatus(), err.getResponse())
            : this.prisma.idempotencyKey.delete({ where: { userId_key: { userId, key } } });
        return from(p.then(() => Promise.reject(err)));
      }),
    );
  }
}
