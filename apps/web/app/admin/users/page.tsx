'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Pager } from '@/components/admin';
import { Spinner, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function Users() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams(Object.entries({ q, status, page: String(page) }).filter(([, v]) => v));
  const { data } = useApi<{ items: any[]; total: number; page: number; pageSize: number }>(`/admin/users?${params}`);
  const flags = useApi<any[]>('/admin/users/flags/open');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, phone or ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          {['ACTIVE', 'PENDING', 'SUSPENDED', 'BANNED'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {!data ? <Spinner /> : (
        <>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Balance</th><th>Locked</th><th>Joined</th></tr></thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td><Link className="text-gold-400 underline" href={`/admin/users/${u.id}`}>{u.fullName}</Link></td>
                    <td>{u.phone}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="tabular-nums">{birr(u.wallet?.balanceCents ?? 0)}</td>
                    <td className="tabular-nums">{birr(u.wallet?.lockedCents ?? 0)}</td>
                    <td>{dateTime(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
      )}
      <h2 className="pt-4 text-lg font-semibold">Open account flags (multi-account, shared payout accounts, auto-suspensions)</h2>
      {!flags.data ? <Spinner /> : flags.data.length === 0 ? <p className="text-gray-500">None.</p> : (
        <table className="table">
          <thead><tr><th>When</th><th>User</th><th>Severity</th><th>Reason</th></tr></thead>
          <tbody>{flags.data.map((f) => <tr key={f.id}><td>{dateTime(f.createdAt)}</td><td><Link className="underline" href={`/admin/users/${f.userId}`}>{f.userId?.slice(0, 8)}</Link></td><td><StatusBadge status={f.severity} /></td><td>{f.reason}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
