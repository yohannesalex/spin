import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SettingsService } from '../settings/settings.service';

/** Maintenance mode: player money/game actions are blocked; admin, auth and reads still work. */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private settings: SettingsService) {}
  async use(req: Request, _res: Response, next: NextFunction) {
    const path = req.originalUrl;
    if (req.method !== 'GET' && !path.startsWith('/api/admin') && !path.startsWith('/api/auth') && (await this.settings.get('maintenanceMode'))) {
      throw new ServiceUnavailableException('The platform is under maintenance. Please try again soon.');
    }
    next();
  }
}
