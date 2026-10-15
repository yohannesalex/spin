'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ActionButton } from '@/components/admin';
import { Spinner, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Q {
  withdrawals: { id: string; amountCents: number; method: string; destAccount: string; destName: string; status: string; createdAt: string; overdue: boolean; user: { id: string; fullName: string; phone: string; status: string } }[];
  unpaidWinners: { id: string; prizeCents: number; winningNumber: number; drawnAt: string; winner?: { id: string; fullName: string; phone: string } }[];
}

export default function Payouts() {
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const { data, reload } = useApi<Q>('/admin/payouts');
  const history = useApi<any[]>(tab === 'history' ? '/admin/payouts/history' : null);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="mr-4 text-2xl font-bold">Payouts</h1>
        <button className={tab === 'queue' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('queue')}>Queue</button>
        <button className={tab === 'history' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('history')}>History</button>
      </div>
      {tab === 'queue' ? (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Pending withdrawals <span className="text-gray-500">(oldest first; red = waiting over 24 h)</span></h2>
            {data.withdrawals.length === 0 ? <p className="text-gray-500">No pending withdrawals.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Requested</th><th>User</th><th>Amount</th><th>Send to</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {data.withdrawals.map((w) => (
                      <tr key={w.id} className={w.overdue ? 'bg-red-950/40' : ''}>
                        <td className={w.overdue ? 'font-semibold text-red-300' : ''}>{dateTime(w.createdAt)}</td>
                        <td><Link href={`/admin/users/${w.user.id}`} className="underline">{w.user.fullName}</Link><div className="text-xs text-gray-500">{w.user.phone} · {w.user.status}</div></td>
                        <td className="font-semibold tabular-nums">{birr(w.amountCents)}</td>
                        <td>{w.method} <span className="font-mono">{w.destAccount}</span><div className="text-xs text-gray-500">{w.destName}</div></td>
                        <td><StatusBadge status={w.status} /></td>
                        <td className="space-x-1 whitespace-nowrap">
                          <ActionButton label="Mark paid" className="btn-primary btn-sm" path={`/admin/payouts/${w.id}/paid`} multipart reasonLabel="Note (optional)"
                            extra={[{ name: 'transferRef', label: 'Transfer reference', required: true }, { name: 'receipt', label: 'Receipt image (optional)', type: 'file' }]}
                            transform={(v) => ({ transferRef: v.transferRef, reason: v.reason || `Paid, ref ${v.transferRef}` })} noReason onDone={reload} />
                          <ActionButton label="Reject" className="btn-danger btn-sm" path={`/admin/payouts/${w.id}/reject`} reasonLabel="Reason (shown to the player)" onDone={reload} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Unpaid winners (last 30 days)</h2>
            <p className="mb-2 text-sm text-gray-500">Prizes are already in the winners&apos; wallets. &quot;Pay winner now&quot; sends the full prize out and records it as a paid withdrawal in one step.</p>
            {data.unpaidWinners.length === 0 ? <p className="text-gray-500">None.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Drawn</th><th>Winner</th><th>Number</th><th>Prize</th><th /></tr></thead>
                  <tbody>
                    {data.unpaidWinners.map((g) => (
                      <tr key={g.id}>
                        <td><Link className="underline" href={`/admin/games/${g.id}`}>{dateTime(g.drawnAt)}</Link></td>
                        <td>{g.winner ? <Link className="underline" href={`/admin/users/${g.winner.id}`}>{g.winner.fullName}</Link> : '—'}<div className="text-xs text-gray-500">{g.winner?.phone}</div></td>
                        <td>{g.winningNumber}</td>
                        <td className="font-semibold">{birr(g.prizeCents)}</td>
                        <td>
                          <ActionButton label="Pay winner now" className="btn-primary btn-sm" path={`/admin/payouts/games/${g.id}/pay-winner`} onDone={reload}
                            extra={[
                              { name: 'method', label: 'Method', type: 'select', options: [{ value: 'TELEBIRR', label: 'Telebirr' }, { value: 'CBE', label: 'CBE' }], defaultValue: 'TELEBIRR' },
                              { name: 'destAccount', label: 'Destination account / phone', required: true, defaultValue: g.winner?.phone },
                              { name: 'destName', label: 'Destination name', required: true, defaultValue: g.winner?.fullName },
                              { name: 'transferRef', label: 'Transfer reference', required: true },
                            ]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : !history.data ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Updated</th><th>User</th><th>Amount</th><th>To</th><th>Status</th><th>Ref / reason</th></tr></thead>
            <tbody>{history.data.map((w) => (
              <tr key={w.id}><td>{dateTime(w.updatedAt)}</td><td>{w.user.fullName}</td><td>{birr(w.amountCents)}</td><td>{w.method} {w.destAccount}</td><td><StatusBadge status={w.status} /></td><td className="text-gray-400">{w.transferRef ?? w.rejectReason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
