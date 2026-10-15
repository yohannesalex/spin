import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  device: string | null;
  fingerprint: string | null;
}

export function metaFromRequest(req: Request): RequestMeta {
  const fwd = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) as string | undefined;
  const ip = (fwd ? fwd.split(',')[0].trim() : req.ip) || null;
  return {
    ip,
    device: ((req.headers['user-agent'] as string) || '').slice(0, 300) || null,
    fingerprint: ((req.headers['x-device-fingerprint'] as string) || '').slice(0, 128) || null,
  };
}

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  metaFromRequest(ctx.switchToHttp().getRequest()),
);
