import { birrToCents, splitPot } from './money';

describe('splitPot', () => {
  it('10 players × 200 birr → 1,600 prize, 400 commission (acceptance criterion)', () => {
    const pot = 10 * birrToCents(200);
    expect(splitPot(pot, 2000)).toEqual({ prizeCents: 160000, commissionCents: 40000 });
  });

  it('rounds the prize down and gives the santim remainder to the house (REQ-PAY-02)', () => {
    const { prizeCents, commissionCents } = splitPot(333, 2000); // 266.4
    expect(prizeCents).toBe(266);
    expect(commissionCents).toBe(67);
  });

  it('never loses or creates money', () => {
    for (let pot = 1; pot < 5000; pot += 7) {
      for (const bps of [0, 1500, 2000, 2550]) {
        const s = splitPot(pot, bps);
        expect(s.prizeCents + s.commissionCents).toBe(pot);
      }
    }
  });
});
