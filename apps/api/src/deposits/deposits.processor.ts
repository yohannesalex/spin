import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DEPOSIT_QUEUE } from './deposits.queue';
import { DepositsService } from './deposits.service';
import { ProviderUnavailableError } from './verification/fetcher';

@Processor(DEPOSIT_QUEUE, { concurrency: 4 })
export class DepositsProcessor extends WorkerHost {
  private log = new Logger('DepositWorker');
  constructor(private deposits: DepositsService) {
    super();
  }

  async process(job: Job<{ depositId: string }>) {
    const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      await this.deposits.verify(job.data.depositId, last);
    } catch (e) {
      if (!(e instanceof ProviderUnavailableError)) this.log.error(`Deposit ${job.data.depositId}: ${(e as Error).stack}`);
      throw e;
    }
  }
}
