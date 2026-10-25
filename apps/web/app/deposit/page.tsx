'use client';
import { FormEvent, useEffect, useState } from 'react';
import { RequireLogin } from '@/components/RequireLogin';
import { Alert, Field, Spinner, StatusBadge } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { Key, useI18n } from '@/lib/i18n';
import { serverText } from '@/lib/locale';

interface Info { accounts: { provider: 'TELEBIRR' | 'CBE'; accountNumber: string; accountName: string }[]; minDepositCents: number; maxDepositCents: number; simulation?: boolean }
interface Dep { id: string; provider: string; claimedAmountCents: number; creditedCents: number | null; status: string; flagReasons: string[]; createdAt: string; reference: string | null }

function DepositInner() {
  const { t } = useI18n();
  const info = useApi<Info>('/deposits/info');
  const list = useApi<Dep[]>('/deposits');
  const [provider, setProvider] = useState<'TELEBIRR' | 'CBE'>('TELEBIRR');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Dep | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
    if (!reference.trim()) return setError(t('deposit.needReceipt'));
    setBusy(true);
    try {
      const d = await api<Dep>('/deposits', {
        body: { provider, amount: Number(amount), reference: reference.trim() },
        idempotencyKey: newIdempotencyKey(),
      });
      setCurrent(d);
      setAmount('');
      setReference('');
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // TESTING ONLY: shown when the API runs with DEPOSIT_SIMULATION=true.
  const simulate = async () => {
    setError(null);
    if (!(Number(amount) >= 1)) return setError(t('deposit.simulateNeedAmount'));
    setBusy(true);
    try {
      const d = await api<Dep>('/deposits/simulate', { body: { provider, amount: Number(amount) }, idempotencyKey: newIdempotencyKey() });
      setCurrent(d);
      setAmount('');
      setReference('');
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
      <div className="flex rounded-xl border border-slate-200 p-1">
        {(['TELEBIRR', 'CBE'] as const).map((p) => (
          <button key={p} onClick={() => setProvider(p)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${provider === p ? 'bg-gold-400 text-slate-900' : 'text-slate-700'}`}>
            {p === 'TELEBIRR' ? t('provider.TELEBIRR') : t('deposit.cbe')}
          </button>
        ))}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">{t('deposit.step1')}</h2>
        {accounts.length === 0 ? (
          <p className="text-slate-500">{t('deposit.noAccounts')}</p>
        ) : (
          accounts.map((a) => (
            <div key={a.accountNumber} className="rounded-xl bg-slate-100 p-3">
              <div className="text-xs text-slate-500">{t('deposit.accountNumber')}</div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold tabular-nums">{a.accountNumber}</span>
                <button className="btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(a.accountNumber).then(() => setCopied(a.accountNumber))}>{copied === a.accountNumber ? t('common.copied') : t('common.copy')}</button>
              </div>
              <div className="mt-1 text-xs text-slate-500">{t('deposit.accountName')}: <span className="text-slate-800">{a.accountName}</span></div>
            </div>
          ))
        )}
        <p className="text-sm text-slate-500">{t('deposit.limits', { min: birr(info.data.minDepositCents), max: birr(info.data.maxDepositCents) })}</p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold">{t('deposit.step2')}</h2>
        {error && <Alert>{error}</Alert>}
        <Field label={t('deposit.amount')}>
          <input className="input" type="number" inputMode="decimal" step="0.01" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('deposit.orPaste')} hint={t('deposit.linkHint')}>
          <input className="input" required value={reference} onChange={(e) => setReference(e.target.value)} placeholder={provider === 'TELEBIRR' ? 'https://transactioninfo.ethiotelecom.et/receipt/…' : 'https://mbreciept.cbe.com.et/… or FT…'} />
        </Field>
        <button className="btn-primary w-full" disabled={busy || accounts.length === 0}>{t('deposit.submit')}</button>
        {info.data.simulation && (
          <div className="space-y-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">{t('deposit.simulateHint')}</p>
            <button type="button" className="btn-secondary w-full" disabled={busy} onClick={simulate}>{t('deposit.simulate')}</button>
          </div>
        )}
      </form>

      {current && (
        <Alert kind={current.status === 'CREDITED' ? 'success' : current.status === 'REJECTED' ? 'error' : current.status === 'VERIFYING' ? 'info' : 'warn'}>
          <div className="flex items-center gap-2">
            {current.status === 'VERIFYING' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />}
            <b>{birr(current.claimedAmountCents)}</b> — {statusText(current.status)}
          </div>
          {current.flagReasons.length > 0 && <div className="mt-1 text-xs">{current.flagReasons.map(serverText).join(', ')}</div>}
        </Alert>
      )}

      <div className="card">
        <h2 className="mb-2 font-semibold">{t('deposit.recent')}</h2>
        {(list.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data!.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div>{birr(d.creditedCents ?? d.claimedAmountCents)} · {t(`provider.${d.provider}` as Key)}</div>
                  <div className="text-xs text-slate-500">{dateTime(d.createdAt)}{d.reference && ` · ${d.reference}`}</div>
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
