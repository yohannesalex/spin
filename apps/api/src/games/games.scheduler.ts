import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GamesService } from './games.service';

@Injectable()
export class GamesScheduler implements OnApplicationBootstrap {
  private log = new Logger('GamesScheduler');
  private running = false;
  constructor(private games: GamesService) {}

  async onApplicationBootstrap() {
    await this.games.ensureOpenRooms().catch((e) => this.log.error(e.message));
  }

  // Draw / cancel rooms whose deadline passed; keep template rooms open. Every DB step is
  // guarded by row locks + status checks, so running this on several instances is safe.
  @Interval(3000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.games.processDeadlines();
      await this.games.ensureOpenRooms();
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.running = false;
    }
  }
}
