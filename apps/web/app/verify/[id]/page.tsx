'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Spinner } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { Key, useI18n } from '@/lib/i18n';

interface Proof {
  gameId: string;
  status: string;
  seedHash: string;
  seed: string | null;
  numbers: number[];
  message: string;
  winnerIndex: number | null;
  winningNumber: number | null;
  potCents: number | null;
  prizeCents: number | null;
  commissionCents: number | null;
  commissionBps: number;
  drawnAt: string | null;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** REQ-GAME-12: recomputes the result in the browser, independently of the server. */
async function recompute(p: Proof) {
  const enc = new TextEncoder();
  const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(p.seed!)));
  const key = await crypto.subtle.importKey('raw', enc.encode(p.seed!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sorted = [...p.numbers].sort((a, b) => a - b);
  const message = `${p.gameId}:${sorted.join(',')}`;
  const hmac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  const index = Number(BigInt(`0x${hmac}`) % BigInt(sorted.length));
  return { hash, hashOk: hash === p.seedHash, message, hmac, index, winningNumber: sorted[index] };
}

export default function Verify() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { data, error, loading } = useApi<Proof>(`/games/${id}/verify`);
  const [calc, setCalc] = useState<Awaited<ReturnType<typeof recompute>> | null>(null);
  useEffect(() => {
    if (data?.seed) recompute(data).then(setCalc);
  }, [data]);

  if (loading) return <Spinner />;
  if (error || !data) return <main className="mx-auto max-w-3xl px-4 py-6"><Alert>{error}</Alert></main>;
  const ok = calc && calc.hashOk && calc.winningNumber === data.winningNumber;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('room.verify')}</h1>
      {!data.seed ? (
        <Alert kind="info">{t('verify.notDrawn')}</Alert>
      ) : calc ? (
        <Alert kind={ok ? 'success' : 'error'}>
          {ok ? t('verify.ok', { number: calc.winningNumber }) : t('verify.failed')}
        </Alert>
      ) : null}

      <div className="card space-y-3 text-sm">
        <Row k={t('verify.game')} v={<code className="break-all">{data.gameId}</code>} />
        <Row k={t('common.status')} v={t(`status.${data.status}` as Key)} />
        <Row k={t('verify.seedHash')} v={<code className="break-all">{data.seedHash}</code>} />
        <Row k={t('verify.seed')} v={<code className="break-all">{data.seed ?? t('verify.hidden')}</code>} />
        <Row k={t('verify.entries', { count: data.numbers.length })} v={data.numbers.join(', ') || '—'} />
        {data.winningNumber != null && (
          <>
            <Row k={t('verify.winning')} v={<b className="text-gold-700">{data.winningNumber}</b>} />
            <Row k={t('verify.split')} v={`${birr(data.potCents)} / ${birr(data.prizeCents)} / ${birr(data.commissionCents)} (${data.commissionBps / 100}%)`} />
            <Row k={t('verify.drawnAt')} v={dateTime(data.drawnAt)} />
          </>
        )}
      </div>

      {calc && (
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">{t('verify.how')}</h2>
          <ol className="list-decimal space-y-2 pl-5 text-slate-700">
            <li>{t('verify.sha')} = <code className="break-all">{calc.hash}</code> {calc.hashOk ? t('verify.matches') : t('verify.differs')}</li>
            <li>{t('verify.message')} = <code className="break-all">{calc.message}</code></li>
            <li>{t('verify.hmac')} = <code className="break-all">{calc.hmac}</code></li>
            <li>{t('verify.index', { n: data.numbers.length })} = <b>{calc.index}</b></li>
            <li>{t('verify.winner', { i: calc.index })} = <b className="text-gold-700">{calc.winningNumber}</b></li>
          </ol>
          <p className="text-slate-500">{t('verify.explain')}</p>
        </div>
      )}
      <Link href={`/room/${data.gameId}`} className="btn-secondary btn-sm">{t('verify.back')}</Link>
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-3">
      <div className="text-slate-500">{k}</div>
      <div className="sm:col-span-2">{v}</div>
    </div>
  );
}
