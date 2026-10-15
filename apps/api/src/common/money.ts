// REQ-WAL-05: all amounts are integer santim (cents). These helpers are the only place
// that converts between birr and santim.

export const birrToCents = (birr: number): number => Math.round(birr * 100);
export const centsToBirr = (cents: number | bigint): number => Number(cents) / 100;

export function formatBirr(cents: number | bigint): string {
  const v = Number(cents) / 100;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} birr`;
}

/**
 * REQ-PAY-01 / REQ-PAY-02: prize = floor(pot × (1 − commission)), the santim remainder
 * goes to the house. Commission is in basis points (2000 = 20%).
 */
export function splitPot(potCents: number, commissionBps: number): { prizeCents: number; commissionCents: number } {
  const prizeCents = Number((BigInt(potCents) * BigInt(10000 - commissionBps)) / 10000n);
  return { prizeCents, commissionCents: potCents - prizeCents };
}
