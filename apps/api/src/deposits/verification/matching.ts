import { FlagSeverity, Provider } from '@prisma/client';
import type { ReceivingAccount } from '../../settings/settings.service';
import type { ParsedReceipt } from './parsed-receipt';

export type FlagCode =
  | 'DUPLICATE'
  | 'WRONG_RECEIVER'
  | 'AMOUNT_MISMATCH'
  | 'STALE_DATE'
  | 'NOT_COMPLETED'
  | 'SENDER_MISMATCH'
  | 'OVER_LIMIT'
  | 'UNREADABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'RECEIPT_NOT_FOUND'
  | 'PARSE_FAILED';

export const FLAG_INFO: Record<FlagCode, { label: string; severity: FlagSeverity }> = {
  DUPLICATE: { label: 'Duplicate receipt', severity: 'HIGH' },
  WRONG_RECEIVER: { label: 'Wrong receiver', severity: 'HIGH' },
  NOT_COMPLETED: { label: 'Not completed', severity: 'HIGH' },
  AMOUNT_MISMATCH: { label: 'Amount mismatch', severity: 'MEDIUM' },
  STALE_DATE: { label: 'Stale or invalid date', severity: 'MEDIUM' },
  SENDER_MISMATCH: { label: 'Sender mismatch', severity: 'MEDIUM' },
  RECEIPT_NOT_FOUND: { label: 'Receipt not found at provider', severity: 'MEDIUM' },
  OVER_LIMIT: { label: 'Over limit', severity: 'LOW' },
  UNREADABLE: { label: 'Unreadable', severity: 'LOW' },
  PROVIDER_UNAVAILABLE: { label: 'Provider unavailable', severity: 'LOW' },
  PARSE_FAILED: { label: 'Receipt could not be parsed', severity: 'LOW' },
};

const SEVERITY_RANK: Record<FlagSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
export const maxSeverity = (codes: FlagCode[]): FlagSeverity | null =>
  codes.reduce<FlagSeverity | null>(
    (acc, c) => (!acc || SEVERITY_RANK[FLAG_INFO[c].severity] > SEVERITY_RANK[acc] ? FLAG_INFO[c].severity : acc),
    null,
  );

// ---------- name matching (fuzzy ≥ 85%) ----------

export function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\b(MR|MRS|MS|DR|ATO|W\/RO|WRO|W\/T)\.?\b/g, ' ')
    .replace(/[^A-Zሀ-፿ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const ratio = (a: string, b: string) => (a.length + b.length === 0 ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));

/**
 * Similarity in [0,1]. Ethiopian receipts often show only first + father's name, or truncate,
 * so we take the best of: full-string ratio, token-sorted ratio, and comparison on the
 * shorter name's token count (first + father's name vs. full three-part name).
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  const tx = x.split(' ');
  const ty = y.split(' ');
  const sorted = ratio([...tx].sort().join(' '), [...ty].sort().join(' '));
  const n = Math.min(tx.length, ty.length);
  const prefix = n >= 2 ? ratio(tx.slice(0, n).join(' '), ty.slice(0, n).join(' ')) : 0;
  return Math.max(ratio(x, y), sorted, prefix, orderedSubset(tx, ty));
}

/**
 * People often register with fewer names than their bank shows ("Yohannes Abdi" vs
 * "Yohannes Alemayehu Abdi"). If every token of the shorter name (at least two, first name
 * included) fuzzy-matches a token of the longer name in the same order, score the average.
 */
function orderedSubset(a: string[], b: string[]): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2 || ratio(short[0], long[0]) < 0.85) return 0;
  let j = 0;
  let total = 0;
  for (const tok of short) {
    while (j < long.length && ratio(tok, long[j]) < 0.85) j++;
    if (j === long.length) return 0;
    total += ratio(tok, long[j++]);
  }
  return total / short.length;
}

// ---------- account matching (receipts mask digits: 1****5678, 2519****1234) ----------

export function maskedAccountMatches(masked: string | null, actual: string): boolean {
  if (!masked) return false;
  const m = masked.replace(/[^\d*]/g, '');
  let a = actual.replace(/\D/g, '');
  if (!m || !a) return false;
  // Telebirr numbers may be shown as 2519XXXXXXXX or 09XXXXXXXX.
  if (/^0[79]\d{8}$/.test(a)) a = `251${a.slice(1)}`;
  const variants = [a, a.startsWith('251') ? `0${a.slice(3)}` : a, a.startsWith('251') ? a.slice(3) : a];
  return variants.some((v) => {
    if (!m.includes('*')) return m === v;
    const firstStar = m.indexOf('*');
    const lastStar = m.lastIndexOf('*');
    const head = m.slice(0, firstStar);
    const tail = m.slice(lastStar + 1);
    return v.length >= head.length + tail.length && v.startsWith(head) && v.endsWith(tail) && tail.length >= 3;
  });
}

// ---------- the rules of §4.4 ----------

export interface MatchContext {
  provider: Provider;
  claimedAmountCents: number;
  accountHolderName: string;
  receivingAccounts: ReceivingAccount[];
  dateWindowHours: number;
  senderNameMinScore: number;
  minDepositCents: number;
  maxDepositCents: number;
  /** Already credited today for this user (excluding this deposit). */
  creditedTodayCents: number;
  dailyDepositLimitCents: number;
  now?: Date;
}

export interface MatchResult {
  ok: boolean;
  flags: FlagCode[];
  details: Record<string, unknown>;
}

const COMPLETED = /^(completed|success|successful|ተጠናቋል)$/i;

export function matchReceipt(r: ParsedReceipt, ctx: MatchContext): MatchResult {
  const flags: FlagCode[] = [];
  const now = ctx.now ?? new Date();
  const details: Record<string, unknown> = {};

  // Receiver: account number AND name must equal a configured active platform account.
  const accounts = ctx.receivingAccounts.filter((a) => a.active && a.provider === ctx.provider);
  const receiver = accounts.find(
    (a) =>
      maskedAccountMatches(r.receiverAccount, a.accountNumber) &&
      !!r.receiverName &&
      nameSimilarity(r.receiverName, a.accountName) >= 0.85,
  );
  details.receiverMatched = receiver?.accountNumber ?? null;
  if (!receiver) flags.push('WRONG_RECEIVER');

  // Amount: exactly equal.
  if (r.amountCents == null || r.amountCents !== ctx.claimedAmountCents) flags.push('AMOUNT_MISMATCH');

  // Date: within the window and not in the future (2 min clock-skew tolerance).
  const t = r.date ? new Date(r.date).getTime() : NaN;
  if (Number.isNaN(t) || t > now.getTime() + 120_000 || now.getTime() - t > ctx.dateWindowHours * 3600_000) {
    flags.push('STALE_DATE');
  }

  // Status
  if (!r.status || !COMPLETED.test(r.status.trim())) flags.push('NOT_COMPLETED');

  // Sender: fuzzy name match ≥ 85%.
  const score = r.payerName ? nameSimilarity(r.payerName, ctx.accountHolderName) : 0;
  details.senderScore = Math.round(score * 100) / 100;
  if (score < ctx.senderNameMinScore) flags.push('SENDER_MISMATCH');

  // Limits
  const amt = r.amountCents ?? ctx.claimedAmountCents;
  if (amt < ctx.minDepositCents || amt > ctx.maxDepositCents || ctx.creditedTodayCents + amt > ctx.dailyDepositLimitCents) {
    flags.push('OVER_LIMIT');
  }

  return { ok: flags.length === 0, flags, details };
}
