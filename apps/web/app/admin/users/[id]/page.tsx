'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ActionButton } from '@/components/admin';
import { Spinner, Stat, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const TABS = ['ledger', 'games', 'deposits', 'withdrawals', 'flags', 'logins', 'devices', 'bans'] as const;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApi<any>(`/admin/users/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>('ledger');
  if (!data) return <Spinner />;
  const u = data.user;
  const done = () => reload();

  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-slate-600">← Users</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{u.fullName}</h1>
        <StatusBadge status={u.status} />
      </div>
      <div className="text-sm text-slate-600">{u.phone} · joined {dateTime(u.createdAt)} · language {u.language} · ID <code>{u.id}</code></div>
      {u.status === 'BANNED' && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">Banned: {u.banReason}{u.bannedUntil && ` (until ${dateTime(u.bannedUntil)})`}</div>}
      {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <div className="text-sm text-amber-700">Login locked until {dateTime(u.lockedUntil)}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Balance" value={birr(data.wallet.balanceCents)} tone="gold" />
        <Stat label="Locked" value={birr(data.wallet.lockedCents)} />
        <Stat label="Open flags" value={data.flags.filter((f: any) => f.status === 'OPEN').length} />
      </div>

      <div className="flex flex-wrap gap-2">
        {u.status !== 'BANNED' ? (
          <ActionButton label="Ban" className="btn-danger btn-sm" path={`/admin/users/${id}/ban`} onDone={done}
            extra={[
              { name: 'until', label: 'Ban until (leave empty for permanent)', type: 'datetime-local' },
              { name: 'withdrawals', label: 'Pending withdrawals', type: 'select', defaultValue: 'cancel', options: [{ value: 'cancel', label: 'Cancel and return to wallet' }, { value: 'freeze', label: 'Freeze (keep locked)' }] },
            ]}
            transform={(v) => ({ reason: v.reason, withdrawals: v.withdrawals, ...(v.until ? { until: new Date(v.until).toISOString() } : {}) })} />
        ) : null}
        {(u.status === 'BANNED' || u.status === 'SUSPENDED') && <ActionButton label={u.status === 'BANNED' ? 'Unban' : 'Lift suspension'} className="btn-primary btn-sm" path={`/admin/users/${id}/unban`} onDone={done} />}
        {u.status === 'ACTIVE' && <ActionButton label="Suspend" path={`/admin/users/${id}/suspend`} onDone={done} />}
        <ActionButton label="Force logout" path={`/admin/users/${id}/force-logout`} onDone={done} />
        <ActionButton label="Reset limits" path={`/admin/users/${id}/reset-limits`} onDone={done} title="Reset limits (login lockout, post-reset withdrawal hold)" />
        <ActionButton label="Adjust balance" path={`/admin/users/${id}/adjust`} onDone={done}
          extra={[{ name: 'amount', label: 'Amount in birr (negative to deduct)', type: 'number', required: true }]}
          transform={(v) => ({ amount: Number(v.amount), reason: v.reason })} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-gold-500 text-slate-900' : 'text-slate-600'}`}>{t}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        {tab === 'ledger' && (
          <table className="table"><thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Ref</th><th>Note</th><th>By</th></tr></thead>
            <tbody>{data.ledger.map((e: any) => <tr key={e.id}><td>{dateTime(e.createdAt)}</td><td>{e.type}</td><td className={`tabular-nums ${e.amountCents >= 0 ? 'text-emerald-600' : ''}`}>{birr(e.amountCents, { sign: true })}</td><td className="text-xs">{e.refType} {e.refId.slice(0, 8)}</td><td>{e.note}</td><td className="text-xs">{e.createdBy?.slice(0, 8)}</td></tr>)}</tbody></table>
        )}
        {tab === 'games' && (
          <table className="table"><thead><tr><th>Joined</th><th>Game</th><th>Number</th><th>Stake</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>{data.games.map((e: any) => <tr key={e.id}><td>{dateTime(e.createdAt)}</td><td><Link className="underline" href={`/admin/games/${e.game.id}`}>{e.game.id.slice(0, 8)}</Link></td><td>{e.number}</td><td>{birr(e.game.stakeCents)}</td><td><StatusBadge status={e.game.status} /></td><td>{e.game.winnerUserId === u.id ? <b className="text-gold-700">Won {birr(e.game.prizeCents)}</b> : e.game.winningNumber ?? '—'}</td></tr>)}</tbody></table>
        )}
        {tab === 'deposits' && (
          <table className="table"><thead><tr><th>When</th><th>Provider</th><th>Reference</th><th>Claimed</th><th>Credited</th><th>Status</th></tr></thead>
            <tbody>{data.deposits.map((d: any) => <tr key={d.id}><td><Link className="underline" href={`/admin/deposits/${d.id}`}>{dateTime(d.createdAt)}</Link></td><td>{d.provider}</td><td className="font-mono text-xs">{d.reference}</td><td>{birr(d.claimedAmountCents)}</td><td>{birr(d.creditedCents)}</td><td><StatusBadge status={d.status} /></td></tr>)}</tbody></table>
        )}
        {tab === 'withdrawals' && (
          <table className="table"><thead><tr><th>When</th><th>Amount</th><th>To</th><th>Status</th><th>Ref / reason</th></tr></thead>
            <tbody>{data.withdrawals.map((w: any) => <tr key={w.id}><td>{dateTime(w.createdAt)}</td><td>{birr(w.amountCents)}</td><td>{w.method} {w.destAccount} ({w.destName})</td><td><StatusBadge status={w.status} /></td><td>{w.transferRef ?? w.rejectReason}</td></tr>)}</tbody></table>
        )}
        {tab === 'flags' && (
          <table className="table"><thead><tr><th>When</th><th>Subject</th><th>Severity</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>{data.flags.map((f: any) => <tr key={f.id}><td>{dateTime(f.createdAt)}</td><td>{f.subjectType}</td><td><StatusBadge status={f.severity} /></td><td>{f.reason}</td><td><StatusBadge status={f.status} /></td></tr>)}</tbody></table>
        )}
        {tab === 'logins' && (
          <table className="table"><thead><tr><th>When</th><th>Result</th><th>IP</th><th>Device</th></tr></thead>
            <tbody>{data.logins.map((l: any) => <tr key={l.id}><td>{dateTime(l.createdAt)}</td><td>{l.success ? '✔' : <span className="text-red-600">failed</span>}</td><td>{l.ip}</td><td className="max-w-md truncate text-xs">{l.device}</td></tr>)}</tbody></table>
        )}
        {tab === 'devices' && (
          <table className="table"><thead><tr><th>Started</th><th>IP</th><th>Device</th><th>Fingerprint</th><th>State</th></tr></thead>
            <tbody>{data.sessions.map((s: any) => <tr key={s.id}><td>{dateTime(s.createdAt)}</td><td>{s.ip}</td><td className="max-w-xs truncate text-xs">{s.device}</td><td className="max-w-[160px] truncate font-mono text-xs">{s.fingerprint}</td><td>{s.revokedAt ? 'revoked' : new Date(s.expiresAt) < new Date() ? 'expired' : 'active'}</td></tr>)}</tbody></table>
        )}
        {tab === 'bans' && (
          <table className="table"><thead><tr><th>When</th><th>Reason</th><th>Until</th><th>By</th><th>Lifted</th></tr></thead>
            <tbody>{data.bans.map((b: any) => <tr key={b.id}><td>{dateTime(b.createdAt)}</td><td>{b.reason}</td><td>{b.until ? dateTime(b.until) : 'permanent'}</td><td className="text-xs">{b.bannedBy.slice(0, 8)}</td><td>{b.liftedAt ? dateTime(b.liftedAt) : '—'}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
