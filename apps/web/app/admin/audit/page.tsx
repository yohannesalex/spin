'use client';
import { Fragment, useState } from 'react';
import { JsonBlock, Pager } from '@/components/admin';
import { Spinner } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function Audit() {
  const [action, setAction] = useState('');
  const [targetId, setTargetId] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams(Object.entries({ action, targetId, page: String(page) }).filter(([, v]) => v));
  const { data } = useApi<{ items: any[]; total: number; pageSize: number }>(`/admin/audit?${params}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit log</h1>
      <p className="text-sm text-gray-500">Read-only. The database rejects any update or delete on this table.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Action (e.g. user.ban)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <input className="input max-w-xs" placeholder="Target ID" value={targetId} onChange={(e) => { setTargetId(e.target.value); setPage(1); }} />
      </div>
      {!data ? <Spinner /> : (
        <>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Reason</th><th>IP</th><th /></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="whitespace-nowrap">{dateTime(a.createdAt)}</td>
                      <td>{a.actorName}</td>
                      <td className="font-mono text-xs">{a.action}</td>
                      <td className="text-xs">{a.targetType} {a.targetId?.slice(0, 8)}</td>
                      <td>{a.reason}</td>
                      <td className="text-xs">{a.ip}</td>
                      <td><button className="text-xs text-gold-400" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'hide' : 'before/after'}</button></td>
                    </tr>
                    {open === a.id && (
                      <tr><td colSpan={7}><div className="grid gap-2 md:grid-cols-2"><div><div className="text-xs text-gray-500">Before</div><JsonBlock value={a.before} /></div><div><div className="text-xs text-gray-500">After</div><JsonBlock value={a.after} /></div></div></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}
