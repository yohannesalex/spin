'use client';
import { useEffect, useState } from 'react';
import { Alert, Field, Modal, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Account { provider: 'TELEBIRR' | 'CBE'; accountNumber: string; accountName: string; active: boolean }
interface S { settings: Record<string, any> & { receivingAccounts: Account[] }; secrets: Record<string, boolean> }

// Values stored in santim / basis points are edited in birr / percent.
const FIELDS: { key: string; label: string; unit: 'birr' | 'pct' | 'int' | 'score' | 'bool' | 'sms' }[] = [
  { key: 'defaultCommissionBps', label: 'Default commission', unit: 'pct' },
  { key: 'minStakeCents', label: 'Minimum stake', unit: 'birr' },
  { key: 'maxStakeCents', label: 'Maximum stake', unit: 'birr' },
  { key: 'minDepositCents', label: 'Minimum deposit', unit: 'birr' },
  { key: 'maxDepositCents', label: 'Maximum deposit', unit: 'birr' },
  { key: 'dailyDepositLimitCents', label: 'Daily deposit limit per user', unit: 'birr' },
  { key: 'depositDateWindowHours', label: 'Receipt date window (hours)', unit: 'int' },
  { key: 'senderNameMinScore', label: 'Sender name match threshold (0.5–1)', unit: 'score' },
  { key: 'minWithdrawalCents', label: 'Minimum withdrawal', unit: 'birr' },
  { key: 'maxWithdrawalPerDayCents', label: 'Maximum withdrawal per day', unit: 'birr' },
  { key: 'withdrawalHoldHours', label: 'Deposit hold before withdrawal (hours)', unit: 'int' },
  { key: 'maintenanceMode', label: 'Maintenance mode', unit: 'bool' },
  { key: 'smsProvider', label: 'SMS provider', unit: 'sms' },
];

const toDisplay = (v: any, unit: string) => (unit === 'birr' ? String(v / 100) : unit === 'pct' ? String(v / 100) : String(v));
const fromDisplay = (v: string, unit: string) =>
  unit === 'birr' ? Math.round(Number(v) * 100) : unit === 'pct' ? Math.round(Number(v) * 100) : unit === 'int' ? parseInt(v, 10) : unit === 'score' ? Number(v) : unit === 'bool' ? v === 'true' : v;

export default function Settings() {
  const { data, reload } = useApi<S>('/admin/settings');
  const [edit, setEdit] = useState<{ key: string; label: string; value: unknown } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    if (data) setAccounts(data.settings.receivingAccounts);
  }, [data]);
  if (!data) return <Spinner />;

  const save = async () => {
    setError(null);
    try {
      await api(`/admin/settings/${edit!.key}`, { method: 'PUT', body: { value: edit!.value, reason } });
      setEdit(null);
      setReason('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="card">
        <h2 className="mb-1 font-semibold">Receiving accounts</h2>
        <p className="mb-3 text-sm text-gray-500">Deposits are credited automatically only when the official receipt shows one of these active accounts as the receiver (number and name).</p>
        <div className="space-y-2">
          {accounts.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_90px_40px]">
              <select className="input" value={a.provider} onChange={(e) => setAccounts(accounts.map((x, j) => (j === i ? { ...x, provider: e.target.value as Account['provider'] } : x)))}><option>TELEBIRR</option><option>CBE</option></select>
              <input className="input" placeholder="Account number / phone" value={a.accountNumber} onChange={(e) => setAccounts(accounts.map((x, j) => (j === i ? { ...x, accountNumber: e.target.value } : x)))} />
              <input className="input" placeholder="Account name (as on receipts)" value={a.accountName} onChange={(e) => setAccounts(accounts.map((x, j) => (j === i ? { ...x, accountName: e.target.value } : x)))} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={a.active} onChange={(e) => setAccounts(accounts.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> active</label>
              <button className="btn-secondary btn-sm" onClick={() => setAccounts(accounts.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setAccounts([...accounts, { provider: 'TELEBIRR', accountNumber: '', accountName: '', active: true }])}>Add account</button>
          <button className="btn-primary btn-sm" onClick={() => setEdit({ key: 'receivingAccounts', label: 'Receiving accounts', value: accounts })}>Save accounts…</button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Limits and rules</h2>
        <table className="table">
          <tbody>
            {FIELDS.map((f) => {
              const v = data.settings[f.key];
              return (
                <tr key={f.key}>
                  <td className="text-gray-400">{f.label}</td>
                  <td className="font-semibold">{f.unit === 'bool' ? (v ? 'ON' : 'off') : `${toDisplay(v, f.unit)}${f.unit === 'birr' ? ' birr' : f.unit === 'pct' ? '%' : ''}`}</td>
                  <td className="text-right"><EditValue field={f} current={v} onEdit={(value) => setEdit({ key: f.key, label: f.label, value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card text-sm">
        <h2 className="mb-2 font-semibold">Secrets (environment variables)</h2>
        <p className="mb-2 text-gray-500">Provider keys are never stored in the database or shown here. Set them in the API server&apos;s environment.</p>
        <ul className="space-y-1">
          {Object.entries(data.secrets).map(([k, v]) => <li key={k}>{v ? '✔' : '✘'} {k.replace(/Configured$/, '').replace(/([A-Z])/g, ' $1')}</li>)}
        </ul>
      </section>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Change ${edit?.label}`}>
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field label="Reason (written to the audit log)"><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={reason.trim().length < 3} onClick={save}>Save</button>
        </div>
      </Modal>
    </div>
  );
}

function EditValue({ field, current, onEdit }: { field: (typeof FIELDS)[number]; current: unknown; onEdit: (v: unknown) => void }) {
  const [v, setV] = useState(toDisplay(current, field.unit));
  useEffect(() => setV(toDisplay(current, field.unit)), [current, field.unit]);
  return (
    <div className="flex justify-end gap-2">
      {field.unit === 'bool' ? (
        <select className="input max-w-[120px]" value={v} onChange={(e) => setV(e.target.value)}><option value="true">ON</option><option value="false">off</option></select>
      ) : field.unit === 'sms' ? (
        <select className="input max-w-[160px]" value={v} onChange={(e) => setV(e.target.value)}><option value="console">console (dev)</option><option value="afromessage">AfroMessage</option></select>
      ) : (
        <input className="input max-w-[140px]" type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} />
      )}
      <button className="btn-secondary btn-sm" disabled={v === toDisplay(current, field.unit)} onClick={() => onEdit(fromDisplay(v, field.unit))}>Change…</button>
    </div>
  );
}
