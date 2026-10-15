import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, PlayerOnly, Public } from '../common/auth.decorators';
import { Idempotent } from '../common/idempotency.interceptor';
import { JoinDto } from './dto';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private games: GamesService) {}

  @Public() @Get()
  lobby() {
    return this.games.lobby();
  }

  @Get('mine') @PlayerOnly()
  mine(@CurrentUser() user: AuthUser) {
    return this.games.myGames(user.id);
  }

  @Public() @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.games.view(id, req.user?.id);
  }

  @Public() @Get(':id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.games.verifyData(id);
  }

  // REQ-SEC-04: rate limit room joins.
  @Post(':id/join') @PlayerOnly() @Idempotent() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JoinDto) {
    return this.games.join(user.id, id, dto.number);
  }
}
