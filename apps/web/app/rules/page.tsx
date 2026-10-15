'use client';
import { Spinner } from '@/components/ui';
import { birr } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { RoomSummary } from '../page';

// REQ-UX-04: stake, commission, prize and odds for every room.
export default function Rules() {
  const { t } = useI18n();
  const { data } = useApi<{ rooms: RoomSummary[] }>('/games');
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('rules.title')}</h1>
      <div className="card space-y-2 text-gray-300">
        <p>1. Every room has a fixed stake. You pay it from your wallet to take one number from 1 to 100. Each number can be taken by only one player, and you get one number per room.</p>
        <p>2. A room draws automatically when it is full. If it has a deadline, it draws with the players present once the deadline passes — as long as the minimum number of players joined. Otherwise the room is cancelled and every stake is refunded to your wallet.</p>
        <p>3. The winner is drawn only from the numbers players actually took, so every game has exactly one winner. With <i>n</i> players, each player&apos;s chance is 1 in <i>n</i>.</p>
        <p>4. The winner receives the pot minus the house commission (default 20%). Prizes are rounded down to the nearest santim.</p>
        <p>5. Draws are provably fair: before anyone joins, we publish the SHA-256 hash of a secret seed. After the draw we reveal the seed, and anyone can recompute the result on the game&apos;s Verify page.</p>
        <p>6. Once you pay for a number you cannot leave the room, except when it is cancelled and refunded.</p>
        <p>7. You must be 18 or older to play. Please play responsibly.</p>
      </div>
      <h2 className="text-lg font-semibold">Current rooms</h2>
      {!data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>{t('room.stake')}</th><th>Players</th><th>Commission</th><th>{t('room.prizeIfFull')}</th><th>Odds per player</th></tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.id}>
                  <td>{birr(r.stakeCents)}</td>
                  <td>{r.minPlayers}–{r.capacity}</td>
                  <td>{r.commissionBps / 100}%</td>
                  <td className="text-gold-400">{birr(r.prizeIfFullCents)}</td>
                  <td>1 in {r.capacity} (full) · 1 in {r.minPlayers} (minimum)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
