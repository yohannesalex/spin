import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Deposit, Prisma, Provider } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Queue } from 'bullmq';
import { birrToCents, formatBirr } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { FlagsService } from '../flags/flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { WalletService } from '../wallet/wallet.service';
import { DEPOSIT_JOB_OPTS, DEPOSIT_QUEUE } from './deposits.queue';
import { SimulateDepositDto, SubmitDepositDto } from './dto';
import { CbeReceiptJson, parseCbeJson, parseCbePdf } from './verification/cbe.parser';
import { fetchCbeShortReceipt, fetchReceipt, FetchedReceipt, ProviderUnavailableError, ReceiptNotFoundError } from './verification/fetcher';
import { FLAG_INFO, FlagCode, matchReceipt, maxSeverity } from './verification/matching';
import { ParsedReceipt } from './verification/parsed-receipt';
import { decodeQr, ocrText } from './verification/qr';
import { extractReference, ExtractedRef, findReferenceInText, receiptUrl } from './verification/reference';
import { parseTelebirrHtml } from './verification/telebirr.parser';

/** Testing mode: see simulate(). */
export const SIMULATION = process.env.DEPOSIT_SIMULATION === 'true';

const startOfDay = () => {
  // Ethiopian calendar day boundaries (UTC+3).
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - 3 * 3600_000);
};

@Injectable()
export class DepositsService {
  private log = new Logger('Deposits');
  private parseFailures: Record<Provider, number> = { TELEBIRR: 0, CBE: 0 };

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private wallets: WalletService,
    private settings: SettingsService,
    private flags: FlagsService,
    private notifications: NotificationsService,
    @InjectQueue(DEPOSIT_QUEUE) private queue: Queue,
  ) {}

  // ---------- §4.2 user side ----------

  async submit(userId: string, dto: SubmitDepositDto) {
    const referenceInput = dto.reference.trim();
    // Reject anything that isn't a Telebirr / CBE receipt link or reference straight away.
    if (!extractReference(referenceInput, dto.provider)) {
      throw new BadRequestException(
        dto.provider === 'CBE'
          ? 'That is not a CBE receipt link. Paste the link from Share in your CBE app (https://mbreciept.cbe.com.et/…) or the FT… reference.'
          : 'That is not a Telebirr receipt link. Paste the link from Share in your Telebirr app (https://transactioninfo.ethiotelecom.et/receipt/…) or the 10-character transaction number.',
      );
    }
    // REQ-DEP-06: max 5 deposit submissions per user per hour.
    const lastHour = await this.prisma.deposit.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (lastHour >= 5) throw new HttpException('Too many deposits this hour. Try again later.', HttpStatus.TOO_MANY_REQUESTS);

    const deposit = await this.prisma.deposit.create({
      data: { userId, provider: dto.provider, claimedAmountCents: birrToCents(dto.amount), referenceInput },
    });
    await this.enqueue(deposit.id);
    return this.forUser(deposit);
  }

  /**
   * TEMPORARY (testing): with DEPOSIT_SIMULATION=true, players can credit any amount without a
   * receipt. The deposit gets a fake receipt URL and a SIM-… reference so it is easy to spot
   * (and exclude) later. The API refuses to start with this flag in production.
   */
  async simulate(userId: string, dto: SimulateDepositDto) {
    if (!SIMULATION) throw new ForbiddenException('Payment simulation is turned off');
    const reference = `SIM-${randomBytes(5).toString('hex').toUpperCase()}`;
    const amountCents = birrToCents(dto.amount);
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        provider: dto.provider,
        claimedAmountCents: amountCents,
        reference,
        referenceInput: `https://simulated.spin-draw.test/receipt/${reference}`,
        parsedJson: { simulated: true, reference, amountCents, date: new Date().toISOString(), status: 'Completed' },
      },
    });
    await this.credit(deposit.id, amountCents, null, 'SIMULATED payment (testing mode)');
    return this.forUser(await this.prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } }));
  }

  async enqueue(depositId: string) {
    await this.queue.add('verify', { depositId }, { ...DEPOSIT_JOB_OPTS, jobId: `${depositId}-${Date.now()}` });
  }

  forUser(d: Deposit) {
    return {
      id: d.id,
      provider: d.provider,
      claimedAmountCents: d.claimedAmountCents,
      creditedCents: d.creditedCents,
      reference: d.reference,
      status: d.status,
      flagReasons: d.flagReasons.map((c) => FLAG_INFO[c as FlagCode]?.label ?? c),
      createdAt: d.createdAt,
    };
  }

  async listForUser(userId: string) {
    const items = await this.prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return items.map((d) => this.forUser(d));
  }

  async getForUser(userId: string, id: string) {
    const d = await this.prisma.deposit.findFirst({ where: { id, userId } });
    if (!d) throw new NotFoundException();
    return this.forUser(d);
  }

  async depositInfo() {
    const s = await this.settings.all();
    return {
      accounts: s.receivingAccounts
        .filter((a) => a.active)
        .map((a) => ({ provider: a.provider, accountNumber: a.accountNumber, accountName: a.accountName })),
      minDepositCents: s.minDepositCents,
      maxDepositCents: s.maxDepositCents,
      dailyDepositLimitCents: s.dailyDepositLimitCents,
      simulation: SIMULATION,
    };
  }

  // ---------- §4.3 verification (runs in the BullMQ worker) ----------

  /**
   * Returns normally when the deposit reached a final state for this attempt.
   * Throws ProviderUnavailableError so BullMQ retries (REQ-DEP-05).
   */
  async verify(depositId: string, isLastAttempt: boolean): Promise<void> {
    const deposit = await this.prisma.deposit.update({ where: { id: depositId }, data: { attempts: { increment: 1 } } });
    if (deposit.status !== 'VERIFYING') return;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: deposit.userId } });

    // Steps 1–2: reference from the pasted link. (Older deposits may carry an uploaded image
    // instead; re-running those still reads the QR code / OCR.)
    let ref: ExtractedRef | null = deposit.referenceInput ? extractReference(deposit.referenceInput, deposit.provider) : null;
    let image: Buffer | null = null;
    if (!ref && deposit.imageKey) {
      image = await this.storage.get(deposit.imageKey);
      const qr = await decodeQr(image).catch(() => null);
      if (qr) ref = extractReference(qr, deposit.provider);
      if (!ref) {
        const text = await ocrText(image);
        if (text) ref = findReferenceInText(text, deposit.provider);
      }
    }
    if (!ref) return this.flag(deposit, ['UNREADABLE']);
    if (ref.provider !== deposit.provider) {
      // User picked the wrong provider tab; trust the receipt and record it.
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { provider: ref.provider } });
      deposit.provider = ref.provider;
    }
    await this.prisma.deposit.update({ where: { id: deposit.id }, data: { reference: ref.reference } });
    deposit.reference = ref.reference;

    // Step 3: duplicates are rejected immediately, even when submitted by a different user.
    // (CBE short links only reveal the FT reference after fetching — checked below.)
    if (!ref.cbeShortCode && (await this.isDuplicate(deposit.id, ref.provider, ref.reference))) {
      return this.flag(deposit, ['DUPLICATE'], 'REJECTED');
    }

    // Step 4: fetch and parse the official receipt (the source of truth — REQ-DEP-01).
    const settings = await this.settings.all();
    let fetched: FetchedReceipt | null = null;
    try {
      fetched = await this.fetchOfficial(ref, settings.receivingAccounts.filter((a) => a.active && a.provider === 'CBE').map((a) => a.accountNumber));
    } catch (e) {
      if (e instanceof ProviderUnavailableError) {
        if (isLastAttempt) return this.flag(deposit, ['PROVIDER_UNAVAILABLE']);
        throw e;
      }
      if (e instanceof ReceiptNotFoundError) return this.flag(deposit, ['RECEIPT_NOT_FOUND']);
      throw e;
    }

    let parsed: ParsedReceipt;
    let rawKey: string;
    if (ref.provider === 'TELEBIRR') {
      rawKey = await this.storage.put('raw-receipts', fetched.body, 'html');
      parsed = parseTelebirrHtml(fetched.body.toString('utf8'));
    } else if (ref.cbeShortCode) {
      rawKey = await this.storage.put('raw-receipts', fetched.body, 'json');
      try {
        parsed = parseCbeJson(JSON.parse(fetched.body.toString('utf8')) as CbeReceiptJson);
      } catch {
        parsed = null as unknown as ParsedReceipt;
      }
    } else {
      rawKey = await this.storage.put('raw-receipts', fetched.body, 'pdf');
      parsed = (await parseCbePdf(fetched.body).catch(() => ({ parsed: null as unknown as ParsedReceipt }))).parsed;
    }
    // REQ-DEP-02: keep the raw receipt and parsed fields for every deposit.
    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: { rawReceiptKey: rawKey, parsedJson: (parsed ?? undefined) as unknown as Prisma.InputJsonValue | undefined },
    });
    if (!parsed || (parsed.amountCents == null && !parsed.payerName)) {
      await this.trackParseFailure(ref.provider);
      return this.flag(deposit, ['PARSE_FAILED']);
    }
    this.parseFailures[ref.provider] = 0;
    if (ref.cbeShortCode) {
      if (!parsed.reference) return this.flag(deposit, ['PARSE_FAILED']);
      ref.reference = parsed.reference;
      await this.prisma.deposit.update({ where: { id: deposit.id }, data: { reference: ref.reference } });
      deposit.reference = ref.reference;
      if (await this.isDuplicate(deposit.id, ref.provider, ref.reference)) return this.flag(deposit, ['DUPLICATE'], 'REJECTED');
    }
    if (parsed.reference && parsed.reference.toUpperCase() !== ref.reference) return this.flag(deposit, ['PARSE_FAILED']);

    // Step 5: §4.4 rules.
    const creditedToday = await this.prisma.deposit.aggregate({
      where: { userId: deposit.userId, status: 'CREDITED', updatedAt: { gte: startOfDay() } },
      _sum: { creditedCents: true },
    });
    const result = matchReceipt(parsed, {
      provider: ref.provider,
      claimedAmountCents: deposit.claimedAmountCents,
      accountHolderName: user.fullName,
      receivingAccounts: settings.receivingAccounts,
      dateWindowHours: settings.depositDateWindowHours,
      senderNameMinScore: settings.senderNameMinScore,
      minDepositCents: settings.minDepositCents,
      maxDepositCents: settings.maxDepositCents,
      creditedTodayCents: creditedToday._sum.creditedCents ?? 0,
      dailyDepositLimitCents: settings.dailyDepositLimitCents,
    });
    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: { parsedJson: { ...parsed, match: result.details } as Prisma.InputJsonValue },
    });
    if (!result.ok) return this.flag(deposit, result.flags);

    // Step 6: credit + mark the reference used, in one transaction.
    try {
      await this.credit(deposit.id, parsed.amountCents!, null);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.flag(deposit, ['DUPLICATE'], 'REJECTED');
      throw e;
    }
  }

  private async fetchOfficial(ref: ExtractedRef, cbeAccounts: string[]): Promise<FetchedReceipt> {
    if (ref.cbeShortCode) return fetchCbeShortReceipt(ref.cbeShortCode);
    if (ref.provider === 'TELEBIRR' || ref.cbeId) return fetchReceipt(receiptUrl(ref));
    // CBE needs FT ref + last 8 digits of the payer's OR receiver's account; we use our own.
    let lastErr: Error = new ReceiptNotFoundError('No CBE receiving account configured');
    for (const acct of cbeAccounts) {
      const digits = acct.replace(/\D/g, '');
      try {
        return await fetchReceipt(receiptUrl(ref, digits.slice(-8)));
      } catch (e) {
        lastErr = e as Error;
        if (e instanceof ProviderUnavailableError) throw e;
      }
    }
    throw lastErr;
  }

  private async isDuplicate(depositId: string, provider: Provider, reference: string) {
    const [used, other] = await Promise.all([
      this.prisma.usedReference.findUnique({ where: { provider_reference: { provider, reference } } }),
      this.prisma.deposit.findFirst({
        where: { provider, reference, id: { not: depositId }, status: { in: ['VERIFYING', 'UNDER_REVIEW', 'CREDITED'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true },
      }),
    ]);
    if (used) return true;
    // Two submissions racing with the same receipt: the earliest one keeps it.
    if (other) {
      const self = await this.prisma.deposit.findUniqueOrThrow({ where: { id: depositId }, select: { createdAt: true } });
      return other.createdAt <= self.createdAt;
    }
    return false;
  }

  private async trackParseFailure(provider: Provider) {
    // REQ-DEP-04: alert when parsing fails repeatedly (format change at the provider).
    this.parseFailures[provider] += 1;
    if (this.parseFailures[provider] === 3) {
      this.log.error(`${provider} receipt parsing failed 3 times in a row — format may have changed`);
      await this.notifications.alertAdmins('Receipt parser failing', `${provider} receipts failed to parse 3 times in a row. The receipt format may have changed.`, {
        href: '/admin/deposits',
        dedupeKey: `parser:${provider}`,
      });
    }
  }

  private async flag(deposit: Deposit, codes: FlagCode[], status: 'UNDER_REVIEW' | 'REJECTED' = 'UNDER_REVIEW') {
    const severity = maxSeverity(codes)!;
    await this.prisma.$transaction(async (tx) => {
      await tx.deposit.update({ where: { id: deposit.id }, data: { status, flagReasons: codes, highestSeverity: severity } });
      await this.flags.raise(
        {
          subjectType: 'DEPOSIT',
          subjectId: deposit.id,
          userId: deposit.userId,
          severity,
          reason: codes.map((c) => FLAG_INFO[c].label).join(', '),
        },
        tx,
      );
      await this.notifications.inApp(
        deposit.userId,
        'deposit',
        status === 'REJECTED' ? 'Deposit rejected' : 'Deposit under review',
        status === 'REJECTED'
          ? `Your ${formatBirr(deposit.claimedAmountCents)} deposit was rejected: ${codes.map((c) => FLAG_INFO[c].label).join(', ')}.`
          : `Your ${formatBirr(deposit.claimedAmountCents)} deposit needs a quick manual check. We'll update you soon.`,
        { depositId: deposit.id },
        tx,
      );
    });
  }

  /** Credits a deposit. `adminId` null = automatic. Unique used_references makes reuse impossible. */
  async credit(depositId: string, amountCents: number, adminId: string | null, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM deposits WHERE id = ${depositId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException();
      const d = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
      if (d.status === 'CREDITED') throw new BadRequestException('Deposit already credited');
      if (d.reference) await tx.usedReference.create({ data: { provider: d.provider, reference: d.reference, depositId } });
      const wallet = await this.wallets.ensureWallet(d.userId, tx);
      await this.wallets.post(tx, {
        walletId: wallet.id,
        type: 'DEPOSIT',
        amountCents,
        refType: 'deposit',
        refId: depositId,
        createdBy: adminId ?? 'system',
        note,
      });
      const updated = await tx.deposit.update({
        where: { id: depositId },
        data: {
          status: 'CREDITED',
          creditedCents: amountCents,
          reviewedBy: adminId,
          reviewedAt: adminId ? new Date() : null,
          reviewNote: note,
        },
      });
      await this.notifications.inApp(d.userId, 'deposit', 'Deposit credited', `${formatBirr(amountCents)} was added to your wallet.`, { depositId }, tx);
      return updated;
    });
  }
}
