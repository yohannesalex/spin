import { matchReceipt, MatchContext, maskedAccountMatches, nameSimilarity } from './matching';
import { ParsedReceipt } from './parsed-receipt';

const now = new Date('2026-10-15T12:00:00Z');
const ctx: MatchContext = {
  provider: 'TELEBIRR',
  claimedAmountCents: 50000,
  accountHolderName: 'Abebe Kebede Tesfaye',
  receivingAccounts: [{ provider: 'TELEBIRR', accountNumber: '+251912345678', accountName: 'SPIN DRAW PLC', active: true }],
  dateWindowHours: 24,
  senderNameMinScore: 0.85,
  minDepositCents: 5000,
  maxDepositCents: 5000000,
  creditedTodayCents: 0,
  dailyDepositLimitCents: 10000000,
  now,
};
const good: ParsedReceipt = {
  reference: 'CHQ0FJ403O',
  payerName: 'ABEBE KEBEDE',
  payerAccount: '2519****1111',
  receiverName: 'Spin Draw PLC',
  receiverAccount: '2519****5678',
  amountCents: 50000,
  date: new Date(now.getTime() - 3600_000).toISOString(),
  status: 'Completed',
};

describe('matchReceipt (§4.4)', () => {
  it('passes a correct receipt', () => {
    expect(matchReceipt(good, ctx)).toMatchObject({ ok: true, flags: [] });
  });

  it('flags a 1 birr difference as amount mismatch (acceptance criterion)', () => {
    expect(matchReceipt({ ...good, amountCents: 49900 }, ctx).flags).toEqual(['AMOUNT_MISMATCH']);
  });

  it('flags a non-platform receiver as Wrong receiver (acceptance criterion)', () => {
    expect(matchReceipt({ ...good, receiverAccount: '2519****9999' }, ctx).flags).toContain('WRONG_RECEIVER');
    expect(matchReceipt({ ...good, receiverName: 'Someone Else' }, ctx).flags).toContain('WRONG_RECEIVER');
  });

  it('flags receipts older than 24h or in the future as Stale (acceptance criterion)', () => {
    expect(matchReceipt({ ...good, date: new Date(now.getTime() - 25 * 3600_000).toISOString() }, ctx).flags).toEqual(['STALE_DATE']);
    expect(matchReceipt({ ...good, date: new Date(now.getTime() + 3600_000).toISOString() }, ctx).flags).toEqual(['STALE_DATE']);
  });

  it('flags non-completed status, sender mismatch and limits', () => {
    expect(matchReceipt({ ...good, status: 'Pending' }, ctx).flags).toEqual(['NOT_COMPLETED']);
    expect(matchReceipt({ ...good, payerName: 'Hana Girma' }, ctx).flags).toEqual(['SENDER_MISMATCH']);
    expect(matchReceipt(good, { ...ctx, creditedTodayCents: 9990000 }).flags).toEqual(['OVER_LIMIT']);
  });
});

describe('helpers', () => {
  it('fuzzy-matches names', () => {
    expect(nameSimilarity('ABEBE KEBEDE', 'Abebe Kebede Tesfaye')).toBeGreaterThanOrEqual(0.85);
    expect(nameSimilarity('Abebe Kebde', 'Abebe Kebede')).toBeGreaterThanOrEqual(0.85);
    expect(nameSimilarity('Kebede Abebe', 'Abebe Kebede')).toBe(1);
    expect(nameSimilarity('Hana Girma', 'Abebe Kebede')).toBeLessThan(0.85);
  });

  it('matches masked accounts', () => {
    expect(maskedAccountMatches('1****0001', '1000000000001')).toBe(true);
    expect(maskedAccountMatches('2519****5678', '+251912345678')).toBe(true);
    expect(maskedAccountMatches('09****5678', '+251912345678')).toBe(true);
    expect(maskedAccountMatches('1****0002', '1000000000001')).toBe(false);
    expect(maskedAccountMatches('251912345678', '+251912345678')).toBe(true);
  });
});
