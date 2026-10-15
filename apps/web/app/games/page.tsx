'use client';
import Link from 'next/link';
import { RequireLogin } from '@/components/RequireLogin';
import { Spinner } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

interface G { gameId: string; number: number; stakeCents: number; status: string; winningNumber: number | null; won: boolean; prizeCents: number | null; drawnAt: string | null; joinedAt: string }

function GamesInner() {
  const { t } = useI18n();
  const { data } = useApi<G[]>('/games/mine');
  if (!data) return <Spinner />;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">{t('games.title')}</h1>
      {data.length === 0 ? (
        <p className="text-slate-500">{t('games.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((g) => (
            <li key={g.gameId}>
              <Link href={`/room/${g.gameId}`} className="card flex items-center justify-between gap-2 hover:border-slate-300">
                <div>
                  <div className="font-semibold">#{g.number} · {birr(g.stakeCents)}</div>
                  <div className="text-xs text-slate-500">{dateTime(g.drawnAt ?? g.joinedAt)}{g.winningNumber != null && ` · ${t('room.numberWon', { number: g.winningNumber })}`}</div>
                </div>
                <span className={`font-semibold ${g.won ? 'text-gold-700' : 'text-slate-600'}`}>
                  {g.status === 'OPEN' ? t('games.open') : g.status === 'CANCELLED' ? t('games.refunded') : g.won ? `${t('games.won')} ${birr(g.prizeCents)}` : t('games.lost')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function Games() {
  return <RequireLogin><GamesInner /></RequireLogin>;
}
