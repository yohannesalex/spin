'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Spinner } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

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
      <h1 className="text-2xl font-bold">Verify this game</h1>
      {!data.seed ? (
        <Alert kind="info">This game has not been drawn yet. The seed hash below is the server&apos;s commitment; the seed is revealed after the draw.</Alert>
      ) : calc ? (
        <Alert kind={ok ? 'success' : 'error'}>
          {ok ? `✔ Verified in your browser: the seed matches the published hash and produces number ${calc.winningNumber}.` : '✘ Verification failed — the result does not match.'}
        </Alert>
      ) : null}

      <div className="card space-y-3 text-sm">
        <Row k="Game" v={<code className="break-all">{data.gameId}</code>} />
        <Row k="Status" v={data.status} />
        <Row k="Seed hash (published at open)" v={<code className="break-all">{data.seedHash}</code>} />
        <Row k="Revealed seed" v={<code className="break-all">{data.seed ?? 'hidden until the draw'}</code>} />
        <Row k={`Entries (${data.numbers.length}, sorted)`} v={data.numbers.join(', ') || '—'} />
        {data.winningNumber != null && (
          <>
            <Row k="Winning number" v={<b className="text-gold-400">{data.winningNumber}</b>} />
            <Row k="Pot / prize / commission" v={`${birr(data.potCents)} / ${birr(data.prizeCents)} / ${birr(data.commissionCents)} (${data.commissionBps / 100}%)`} />
            <Row k="Drawn at" v={dateTime(data.drawnAt)} />
          </>
        )}
      </div>

      {calc && (
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">How it was computed</h2>
          <ol className="list-decimal space-y-2 pl-5 text-gray-300">
            <li>SHA-256(seed) = <code className="break-all">{calc.hash}</code> {calc.hashOk ? '✔ matches' : '✘ differs'}</li>
            <li>message = gameId + &quot;:&quot; + sorted numbers = <code className="break-all">{calc.message}</code></li>
            <li>HMAC-SHA256(key = seed, message) = <code className="break-all">{calc.hmac}</code></li>
            <li>index = that value as an integer mod {data.numbers.length} = <b>{calc.index}</b></li>
            <li>winner = sorted numbers[{calc.index}] = <b className="text-gold-400">{calc.winningNumber}</b></li>
          </ol>
          <p className="text-gray-500">The seed was fixed (and its hash published) before anyone joined, so neither the house nor any player could steer the result.</p>
        </div>
      )}
      <Link href={`/room/${data.gameId}`} className="btn-secondary btn-sm">Back to room</Link>
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-3">
      <div className="text-gray-500">{k}</div>
      <div className="sm:col-span-2">{v}</div>
    </div>
  );
}
