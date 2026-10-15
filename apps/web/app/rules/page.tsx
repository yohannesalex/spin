'use client';
import { Spinner } from '@/components/ui';
import { birr } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { RoomSummary } from '../page';

const RULES = ['rules.p1', 'rules.p2', 'rules.p3', 'rules.p4', 'rules.p5', 'rules.p6', 'rules.p7'] as const;

// REQ-UX-04: stake, commission, prize and odds for every room.
export default function Rules() {
  const { t } = useI18n();
  const { data } = useApi<{ rooms: RoomSummary[] }>('/games');
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('rules.title')}</h1>
      <div className="card space-y-2 text-slate-700">
        {RULES.map((k, i) => <p key={k}>{i + 1}. {t(k)}</p>)}
      </div>
      <h2 className="text-lg font-semibold">{t('rules.current')}</h2>
      {!data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>{t('room.stake')}</th><th>{t('room.players')}</th><th>{t('rules.commission')}</th><th>{t('room.prizeIfFull')}</th><th>{t('rules.odds')}</th></tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.id}>
                  <td>{birr(r.stakeCents)}</td>
                  <td>{r.minPlayers}–{r.capacity}</td>
                  <td>{r.commissionBps / 100}%</td>
                  <td className="text-gold-700">{birr(r.prizeIfFullCents)}</td>
                  <td>{t('rules.oddsValue', { full: r.capacity, min: r.minPlayers })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
