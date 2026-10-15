import { createHmac } from 'crypto';
import { computeWinner, fairnessMessage, generateSeed, hashSeed } from './fairness';

describe('provably fair draw', () => {
  const gameId = '6f1c2f8e-1111-4c3b-9a55-000000000001';

  it('is deterministic for a seed and entries, regardless of entry order', () => {
    const seed = generateSeed();
    const a = computeWinner(seed, gameId, [37, 4, 91, 12]);
    const b = computeWinner(seed, gameId, [12, 91, 4, 37]);
    expect(a).toEqual(b);
    expect([4, 12, 37, 91]).toContain(a.winningNumber);
  });

  it('matches the published algorithm exactly', () => {
    const seed = 'a'.repeat(64);
    const numbers = [5, 50, 1];
    const msg = fairnessMessage(gameId, numbers);
    expect(msg).toBe(`${gameId}:1,5,50`);
    const hmac = createHmac('sha256', seed).update(msg).digest('hex');
    const idx = Number(BigInt('0x' + hmac) % 3n);
    expect(computeWinner(seed, gameId, numbers).winningNumber).toBe([1, 5, 50][idx]);
  });

  it('commits to the seed with SHA-256', () => {
    expect(hashSeed('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('always picks a chosen number and is roughly uniform', () => {
    const counts = new Map<number, number>();
    const numbers = [3, 7, 11, 19, 42];
    for (let i = 0; i < 5000; i++) {
      const w = computeWinner(generateSeed(), gameId, numbers).winningNumber;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    for (const n of numbers) expect(counts.get(n)! / 5000).toBeGreaterThan(0.15);
  });
});
