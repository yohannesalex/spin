'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { RequireLogin } from '@/components/RequireLogin';
import { Alert, Field, Spinner, StatusBadge } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

interface Info { accounts: { provider: 'TELEBIRR' | 'CBE'; accountNumber: string; accountName: string }[]; minDepositCents: number; maxDepositCents: number }
interface Dep { id: string; provider: string; claimedAmountCents: number; creditedCents: number | null; status: string; flagReasons: string[]; createdAt: string; reference: string | null }

function DepositInner() {
  const { t } = useI18n();
  const info = useApi<Info>('/deposits/info');
  const list = useApi<Dep[]>('/deposits');
  const [provider, setProvider] = useState<'TELEBIRR' | 'CBE'>('TELEBIRR');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Dep | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reloadList = list.reload;

  // Poll the submitted deposit: Verifying → Credited / Under review.
  const currentId = current?.status === 'VERIFYING' ? current.id : null;
  useEffect(() => {
    if (!currentId) return;
    const id = setInterval(async () => {
      const d = await api<Dep>(`/deposits/${currentId}`).catch(() => null);
      if (d) {
        setCurrent(d);
        if (d.status !== 'VERIFYING') reloadList();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [currentId, reloadList]);

  if (!info.data) return <Spinner />;
  const accounts = info.data.accounts.filter((a) => a.provider === provider);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file && !reference.trim()) return setError(t('deposit.receipt'));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('provider', provider);
      fd.set('amount', amount);
      if (reference.trim()) fd.set('reference', reference.trim());
      if (file) fd.set('receipt', file);
      const d = await api<Dep>('/deposits', { body: fd, idempotencyKey: newIdempotencyKey() });
      setCurrent(d);
      setAmount('');
      setReference('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const statusText = (s: string) =>
    s === 'VERIFYING' ? t('deposit.verifying') : s === 'CREDITED' ? t('deposit.credited') : s === 'UNDER_REVIEW' ? t('deposit.review') : t('deposit.rejected');

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('deposit.title')}</h1>
      <div className="flex rounded-xl border border-ink-700 p-1">
        {(['TELEBIRR', 'CBE'] as const).map((p) => (
          <button key={p} onClick={() => setProvider(p)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${provider === p ? 'bg-gold-400 text-ink-950' : 'text-gray-300'}`}>
            {p === 'TELEBIRR' ? 'Telebirr' : 'CBE Mobile Banking'}
          </button>
        ))}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">{t('deposit.step1')}</h2>
        {accounts.length === 0 ? (
          <p className="text-gray-500">{t('deposit.noAccounts')}</p>
        ) : (
          accounts.map((a) => (
            <div key={a.accountNumber} className="rounded-xl bg-ink-800 p-3">
              <div className="text-xs text-gray-500">{t('deposit.accountNumber')}</div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold tabular-nums">{a.accountNumber}</span>
                <button className="btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(a.accountNumber)}>Copy</button>
              </div>
              <div className="mt-1 text-xs text-gray-500">{t('deposit.accountName')}: <span className="text-gray-200">{a.accountName}</span></div>
            </div>
          ))
        )}
        <p className="text-sm text-gray-500">{t('deposit.limits', { min: birr(info.data.minDepositCents), max: birr(info.data.maxDepositCents) })}</p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold">{t('deposit.step2')}</h2>
        {error && <Alert>{error}</Alert>}
        <Field label={t('deposit.amount')}>
          <input className="input" type="number" inputMode="decimal" step="0.01" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('deposit.receipt')} hint="JPG or PNG, up to 5 MB">
          <input ref={fileRef} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-ink-700 file:px-3 file:py-1 file:text-gray-200" type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label={t('deposit.orPaste')}>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={provider === 'TELEBIRR' ? 'https://transactioninfo.ethiotelecom.et/receipt/…' : 'FT…'} />
        </Field>
        <button className="btn-primary w-full" disabled={busy || accounts.length === 0}>{t('deposit.submit')}</button>
      </form>

      {current && (
        <Alert kind={current.status === 'CREDITED' ? 'success' : current.status === 'REJECTED' ? 'error' : current.status === 'VERIFYING' ? 'info' : 'warn'}>
          <div className="flex items-center gap-2">
            {current.status === 'VERIFYING' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />}
            <b>{birr(current.claimedAmountCents)}</b> — {statusText(current.status)}
          </div>
          {current.flagReasons.length > 0 && <div className="mt-1 text-xs">{current.flagReasons.join(', ')}</div>}
        </Alert>
      )}

      <div className="card">
        <h2 className="mb-2 font-semibold">{t('deposit.recent')}</h2>
        {(list.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">—</p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {list.data!.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div>{birr(d.creditedCents ?? d.claimedAmountCents)} · {d.provider}</div>
                  <div className="text-xs text-gray-500">{dateTime(d.createdAt)}{d.reference && ` · ${d.reference}`}</div>
                </div>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function Deposit() {
  return <RequireLogin><DepositInner /></RequireLogin>;
}
