'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ActionButton, ExtraField, Pager } from '@/components/admin';
import { Alert, Field, Modal, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Template { id: string; name: string | null; stakeCents: number; capacity: number; minPlayers: number; commissionBps: number; deadlineMinutes: number | null; active: boolean }

const templateFields = (t?: Template): ExtraField[] => [
  { name: 'name', label: 'Name', defaultValue: t?.name ?? '' },
  { name: 'stake', label: 'Stake (birr)', type: 'number', required: true, defaultValue: t ? String(t.stakeCents / 100) : '100' },
  { name: 'capacity', label: 'Number of players (2–100), e.g. 2, 3, 5, 10', type: 'number', required: true, defaultValue: String(t?.capacity ?? 10) },
  { name: 'minPlayers', label: 'Minimum players to draw at deadline', type: 'number', defaultValue: String(t?.minPlayers ?? 2) },
  { name: 'commissionPct', label: 'Commission %', type: 'number', defaultValue: t ? String(t.commissionBps / 100) : '20' },
  { name: 'deadlineMinutes', label: 'Deadline in minutes (empty = draw only when full)', type: 'number', defaultValue: t?.deadlineMinutes ? String(t.deadlineMinutes) : '' },
  { name: 'active', label: 'Active', type: 'select', defaultValue: t && !t.active ? 'false' : 'true', options: [{ value: 'true', label: 'Active (auto-opens rooms)' }, { value: 'false', label: 'Inactive' }] },
];
const toTemplate = (v: Record<string, string>) => ({
  name: v.name || undefined,
  stake: Number(v.stake),
  capacity: parseInt(v.capacity, 10),
  minPlayers: v.minPlayers ? parseInt(v.minPlayers, 10) : undefined,
  commissionPct: v.commissionPct ? Number(v.commissionPct) : undefined,
  deadlineMinutes: v.deadlineMinutes ? parseInt(v.deadlineMinutes, 10) : null,
  active: v.active !== 'false',
  reason: v.reason,
});

export default function Games() {
  const templates = useApi<Template[]>('/admin/games/templates');
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const games = useApi<{ items: any[]; total: number; pageSize: number }>(`/admin/games?status=${status}&page=${page}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games</h1>
        <ActionButton label="Create game type" className="btn-primary btn-sm" path="/admin/games/templates" extra={templateFields()} transform={toTemplate} onDone={() => { templates.reload(); games.reload(); }} />
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Game types (room templates)</h2>
        <p className="mb-2 text-sm text-slate-500">Each active template keeps one open room; a new one opens as soon as it fills or closes. Edits apply to rooms opened afterwards.</p>
        {!templates.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Stake</th><th>Players</th><th>Commission</th><th>Deadline</th><th>Active</th><th /></tr></thead>
              <tbody>
                {templates.data.map((t) => (
                  <tr key={t.id} className={t.active ? '' : 'opacity-50'}>
                    <td>{t.name ?? '—'}</td><td>{birr(t.stakeCents)}</td><td>{t.minPlayers}–{t.capacity}</td><td>{t.commissionBps / 100}%</td>
                    <td>{t.deadlineMinutes ? `${t.deadlineMinutes} min` : 'when full'}</td><td>{t.active ? 'yes' : 'no'}</td>
                    <td><EditTemplate t={t} onDone={() => { templates.reload(); games.reload(); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Rooms</h2>
          {['OPEN', 'SETTLED', 'CANCELLED', ''].map((s) => (
            <button key={s} className={status === s ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => { setStatus(s); setPage(1); }}>{s ? s.toLowerCase() : 'all'}</button>
          ))}
        </div>
        {!games.data ? <Spinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Opened</th><th>Stake</th><th>Players</th><th>Status</th><th>Winner #</th><th>Pot / prize / commission</th><th /></tr></thead>
                <tbody>
                  {games.data.items.map((g) => (
                    <tr key={g.id}>
                      <td><Link href={`/admin/games/${g.id}`} className="text-gold-700 underline">{dateTime(g.openedAt)}</Link></td>
                      <td>{birr(g.stakeCents)}</td>
                      <td>{g._count.entries} / {g.capacity}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td>{g.winningNumber ?? '—'}</td>
                      <td className="text-xs">{g.potCents != null ? `${birr(g.potCents)} / ${birr(g.prizeCents)} / ${birr(g.commissionCents)}` : '—'}</td>
                      <td>{g.status === 'OPEN' && <ActionButton label="Cancel & refund" className="btn-danger btn-sm" path={`/admin/games/${g.id}/cancel`} onDone={games.reload} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={games.data.total} pageSize={games.data.pageSize} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function EditTemplate({ t, onDone }: { t: Template; onDone: () => void }) {
  // ActionButton POSTs; templates are updated with PATCH, so wrap the request.
  return (
    <ActionButtonPatch label="Edit" path={`/admin/games/templates/${t.id}`} extra={templateFields(t)} transform={toTemplate} onDone={onDone} />
  );
}

function ActionButtonPatch({ label, path, extra, transform, onDone }: { label: string; path: string; extra: ExtraField[]; transform: (v: Record<string, string>) => unknown; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button className="btn-secondary btn-sm" onClick={() => { setValues(Object.fromEntries(extra.map((f) => [f.name, f.defaultValue ?? '']))); setError(null); setOpen(true); }}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit template">
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          {extra.map((f) => (
            <Field key={f.name} label={f.label}>
              {f.type === 'select' ? (
                <select className="input" value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : (
                <input className="input" type={f.type ?? 'text'} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </Field>
          ))}
          <Field label="Reason (written to the audit log)"><textarea className="input" rows={2} value={values.reason ?? ''} onChange={(e) => setValues({ ...values, reason: e.target.value })} /></Field>
          <button className="btn-primary w-full" disabled={(values.reason ?? '').trim().length < 3} onClick={async () => {
            try { await api(path, { method: 'PATCH', body: transform(values) }); setOpen(false); onDone(); } catch (e) { setError((e as Error).message); }
          }}>Save</button>
        </div>
      </Modal>
    </>
  );
}
