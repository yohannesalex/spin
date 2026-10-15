'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Pager } from '@/components/admin';
import { Spinner, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export interface AdminDeposit {
  id: string;
  provider: string;
  claimedAmountCents: number;
  creditedCents: number | null;
  reference: string | null;
  status: string;
  flagReasons: string[];
  flagLabels?: string[];
  highestSeverity: string | null;
  createdAt: string;
  user: { id: string; fullName: string; phone: string; status: string };
}

function Row({ d }: { d: AdminDeposit }) {
  return (
    <tr>
      <td><Link className="text-gold-700 underline" href={`/admin/deposits/${d.id}`}>{dateTime(d.createdAt)}</Link></td>
      <td><Link className="underline" href={`/admin/users/${d.user.id}`}>{d.user.fullName}</Link><div className="text-xs text-slate-500">{d.user.phone}</div></td>
      <td>{d.provider}</td>
      <td className="font-mono text-xs">{d.reference ?? '—'}</td>
      <td className="tabular-nums">{birr(d.claimedAmountCents)}</td>
      <td><StatusBadge status={d.status} /> {d.highestSeverity && <StatusBadge status={d.highestSeverity} />}</td>
      <td className="text-xs text-amber-800">{(d.flagLabels ?? d.flagReasons).join(', ')}</td>
    </tr>
  );
}

function Table({ items }: { items: AdminDeposit[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Submitted</th><th>User</th><th>Provider</th><th>Reference</th><th>Claimed</th><th>Status</th><th>Failed checks</th></tr></thead>
        <tbody>{items.map((d) => <Row key={d.id} d={d} />)}</tbody>
      </table>
    </div>
  );
}

export default function Deposits() {
  const [tab, setTab] = useState<'flagged' | 'all'>('flagged');
  const [q, setQ] = useState({ q: '', reference: '', status: '', provider: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const flagged = useApi<AdminDeposit[]>(tab === 'flagged' ? '/admin/deposits/flagged' : null);
  const params = new URLSearchParams(Object.entries({ ...q, page: String(page) }).filter(([, v]) => v));
  const all = useApi<{ items: AdminDeposit[]; total: number; page: number; pageSize: number }>(tab === 'all' ? `/admin/deposits?${params}` : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-bold">Deposits</h1>
        <button className={tab === 'flagged' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('flagged')}>Flagged queue</button>
        <button className={tab === 'all' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab('all')}>All deposits</button>
      </div>
      {tab === 'flagged' ? (
        !flagged.data ? <Spinner /> : flagged.data.length === 0 ? <p className="text-slate-500">Nothing to review. 🎉</p> : <Table items={flagged.data} />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <input className="input" placeholder="Name or phone" value={q.q} onChange={(e) => { setQ({ ...q, q: e.target.value }); setPage(1); }} />
            <input className="input" placeholder="Reference" value={q.reference} onChange={(e) => { setQ({ ...q, reference: e.target.value }); setPage(1); }} />
            <select className="input" value={q.status} onChange={(e) => { setQ({ ...q, status: e.target.value }); setPage(1); }}>
              <option value="">Any status</option>
              {['VERIFYING', 'CREDITED', 'UNDER_REVIEW', 'REJECTED'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="input" value={q.provider} onChange={(e) => { setQ({ ...q, provider: e.target.value }); setPage(1); }}>
              <option value="">Any provider</option><option>TELEBIRR</option><option>CBE</option>
            </select>
            <input className="input" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
            <input className="input" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
          </div>
          {!all.data ? <Spinner /> : <><Table items={all.data.items} /><Pager page={page} total={all.data.total} pageSize={all.data.pageSize} onPage={setPage} /></>}
        </>
      )}
    </div>
  );
}
