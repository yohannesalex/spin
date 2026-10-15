export interface ParsedReceipt {
  reference: string | null;
  payerName: string | null;
  payerAccount: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  amountCents: number | null;
  date: string | null; // ISO
  status: string | null;
}

/** Parse "1,234.50", "1,234.50 Birr", "ETB 1,234.50" → santim. */
export function parseAmountCents(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /([\d,]+(?:\.\d{1,2})?)/.exec(s.replace(/\s/g, ''));
  if (!m) return null;
  const [whole, frac = ''] = m[1].replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** Build an ISO timestamp from Ethiopian local time (EAT, UTC+3, no DST). */
export function eatToIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, h - 3, mi, s)).toISOString();
}

export const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim() || null;
