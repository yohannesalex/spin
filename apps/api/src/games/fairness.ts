import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * REQ-GAME-09/10 provably-fair commit-reveal.
 *  - On open: seed = 32 random bytes (hex), publish seedHash = SHA-256(seed).
 *  - On draw: message = `${gameId}:${sortedNumbers.join(',')}`
 *             index   = HMAC-SHA256(key = seed, message) as a 256-bit integer mod entries
 *             winner  = sortedNumbers[index]
 *  - After the draw the seed is revealed; anyone can recompute (the web Verify page does).
 * The seed is fixed before anyone joins, and the entries are fixed before it is revealed, so
 * neither the house nor players can steer the result.
 */
export const generateSeed = () => randomBytes(32).toString('hex');
export const hashSeed = (seed: string) => createHash('sha256').update(seed, 'utf8').digest('hex');

export function fairnessMessage(gameId: string, numbers: number[]): string {
  return `${gameId}:${[...numbers].sort((a, b) => a - b).join(',')}`;
}

export function computeWinner(seed: string, gameId: string, numbers: number[]) {
  if (numbers.length === 0) throw new Error('No entries');
  const sorted = [...numbers].sort((a, b) => a - b);
  const hmac = createHmac('sha256', seed).update(fairnessMessage(gameId, sorted), 'utf8').digest('hex');
  const index = Number(BigInt(`0x${hmac}`) % BigInt(sorted.length));
  return { hmac, index, winningNumber: sorted[index], sorted };
}
