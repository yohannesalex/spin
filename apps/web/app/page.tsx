'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { birr, timeLeft } from '@/lib/format';
import { useApi, useNow } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { getSocket, noteServerTime, serverNow } from '@/lib/socket';

export interface RoomSummary {
  id: string;
  stakeCents: number;
  capacity: number;
  minPlayers: number;
  commissionBps: number;
  players: number;
  prizeIfFullCents: number;
  deadlineAt: string | null;
  status: string;
}

export default function Lobby() {
  const { t } = useI18n();
  const { data, loading, reload } = useApi<{ serverTime: number; rooms: RoomSummary[] }>('/games');
  useNow(1000);
  const [before, after] = t('home.example', { amount: '\u0000' }).split('\u0000');

  useEffect(() => {
    if (data) noteServerTime(data.serverTime);
  }, [data]);

  // REQ-GAME-02: the lobby updates in real time.
  useEffect(() => {
    const s = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        reload();
      }, 300);
    };
    const subscribe = () => s.emit('lobby:subscribe');
    subscribe();
    s.on('connect', subscribe);
    s.on('lobby:changed', onChange);
    return () => {
      s.off('connect', subscribe);
      s.off('lobby:changed', onChange);
    };
  }, [reload]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <section className="relative mb-8 overflow-hidden rounded-3xl border border-gold-200 bg-gradient-to-br from-gold-50 via-white to-gold-100 p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-200/50 blur-2xl" aria-hidden="true" />
        <h1 className="relative max-w-2xl text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">{t('home.title')}</h1>
        <p className="relative mt-3 max-w-2xl text-slate-600">{t('home.subtitle')}</p>
        <p className="relative mt-4 inline-block rounded-xl bg-white/80 px-3 py-1.5 text-sm text-slate-600 shadow-sm">
          {before} <span className="font-bold text-gold-700">{birr(160000)}</span>{after}
        </p>
      </section>

      <h2 className="mb-3 text-lg font-semibold">{t('home.open')}</h2>
      {loading && !data ? (
        <Spinner />
      ) : !data?.rooms.length ? (
        <p className="text-slate-500">{t('home.none')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rooms.map((r) => {
            const left = r.deadlineAt ? new Date(r.deadlineAt).getTime() - serverNow() : null;
            const pct = Math.round((r.players / r.capacity) * 100);
            return (
              <Link key={r.id} href={`/room/${r.id}`} className="card block transition hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-xs uppercase text-slate-500">{t('room.stake')}</div>
                    <div className="text-2xl font-bold">{birr(r.stakeCents)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase text-slate-500">{t('room.prizeIfFull')}</div>
                    <div className="text-lg font-bold text-gold-700">{birr(r.prizeIfFullCents)}</div>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-sm text-slate-600">
                  <span>
                    {t('room.players')}: <b className="text-slate-800">{r.players}</b> / {r.capacity}
                  </span>
                  <span className="tabular-nums">{left != null ? `${t('room.timeLeft')}: ${timeLeft(left)}` : t('room.noDeadline')}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
