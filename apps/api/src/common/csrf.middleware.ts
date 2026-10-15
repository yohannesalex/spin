import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * REQ-SEC-01 CSRF protection. Cookies are SameSite=Lax; on top of that every state-changing
 * request must carry the custom X-Requested-With header (which cross-site forms cannot set
 * without a CORS preflight) and, when the browser sends an Origin, it must be our web origin.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private allowed = (process.env.WEB_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim());

  use(req: Request, _res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin && !this.allowed.includes(origin)) throw new ForbiddenException('Bad origin');
    if (req.headers['x-requested-with'] !== 'spin') throw new ForbiddenException('Missing CSRF header');
    next();
  }
}
