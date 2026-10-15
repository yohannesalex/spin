'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ActionButton } from '@/components/admin';
import { Spinner, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApi<any>(`/admin/games/${id}`);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <Link href="/admin/games" className="text-sm text-slate-600">← Games</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Room {birr(data.stakeCents)} · {data.entries.length}/{data.capacity}</h1>
        <StatusBadge status={data.status} />
        {data.status === 'OPEN' && <ActionButton label="Cancel & refund" className="btn-danger btn-sm" path={`/admin/games/${id}/cancel`} onDone={reload} />}
        <Link href={`/verify/${id}`} className="btn-secondary btn-sm" target="_blank">Public verify page</Link>
      </div>
      <p className="text-sm text-slate-500">Results are write-once in the database — nobody, including admins, can change them.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-1 text-sm">
          <div>Opened: {dateTime(data.openedAt)}</div>
          <div>Deadline: {data.deadlineAt ? dateTime(data.deadlineAt) : 'none'}</div>
          <div>Min players: {data.minPlayers} · Commission {data.commissionBps / 100}%</div>
          {data.cancelReason && <div>Cancelled: {data.cancelReason}</div>}
          {data.winningNumber != null && (
            <>
              <div>Drawn: {dateTime(data.drawnAt)}</div>
              <div>Winning number: <b className="text-gold-700">{data.winningNumber}</b></div>
              <div>Pot {birr(data.potCents)} · Prize {birr(data.prizeCents)} · Commission {birr(data.commissionCents)}</div>
            </>
          )}
          <div className="break-all pt-2 text-xs text-slate-500">Seed hash: {data.seedHash}</div>
          <div className="break-all text-xs text-slate-500">Seed: {data.seed ?? 'hidden until draw'}</div>
          <div className="break-all text-xs text-slate-500">Message: {data.proof.message}</div>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">Entries</h2>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><table className="table">
            <thead><tr><th>#</th><th>Player</th><th>Joined</th></tr></thead>
            <tbody>
              {data.entries.map((e: any) => (
                <tr key={e.id} className={e.number === data.winningNumber ? 'bg-gold-50' : ''}>
                  <td className="font-bold">{e.number}</td>
                  <td><Link className="underline" href={`/admin/users/${e.user.id}`}>{e.user.fullName}</Link> <span className="text-xs text-slate-500">{e.user.phone}</span></td>
                  <td>{dateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
