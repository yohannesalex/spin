'use client';
import { FormEvent, useEffect, useState } from 'react';
import { RequireLogin } from '@/components/RequireLogin';
import { Alert, Field, Spinner, StatusBadge } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { Key, useI18n } from '@/lib/i18n';

interface W { id: string; amountCents: number; method: string; destAccount: string; status: string; transferRef: string | null; rejectReason: string | null; createdAt: string }

function WithdrawInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const wallet = useApi<{ balanceCents: number; withdrawableCents: number; lockedCents: number }>('/wallet');
  const config = useApi<{ minWithdrawalCents: number; withdrawalHoldHours: number }>('/config');
  const list = useApi<W[]>('/withdrawals');
  const [f, setF] = useState({ amount: '', method: 'TELEBIRR', destAccount: '', destName: '' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (user) setF((x) => ({ ...x, destName: x.destName || user.fullName, destAccount: x.destAccount || (x.method === 'TELEBIRR' ? user.phone : '') }));
  }, [user]);

  if (!wallet.data) return <Spinner />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api('/withdrawals', { body: { ...f, amount: Number(f.amount) }, idempotencyKey: key });
      setOk(true);
      setF((x) => ({ ...x, amount: '' }));
      setKey(newIdempotencyKey());
      wallet.reload();
      list.reload();
    } catch (err) {
      setError((err as Error).message);
      setKey(newIdempotencyKey());
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('withdraw.title')}</h1>
      <div className="card flex justify-between">
        <div>
          <div className="text-xs text-slate-500">{t('wallet.withdrawable')}</div>
          <div className="text-2xl font-bold text-gold-700">{birr(wallet.data.withdrawableCents)}</div>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{t('wallet.balance')}: {birr(wallet.data.balanceCents)}</div>
          {config.data && <div>{t('withdraw.min', { amount: birr(config.data.minWithdrawalCents) })}</div>}
        </div>
      </div>
      {config.data && wallet.data.withdrawableCents < wallet.data.balanceCents && (
        <Alert kind="info">{t('withdraw.holdInfo', { hours: config.data.withdrawalHoldHours })}</Alert>
      )}

      <form onSubmit={submit} className="card space-y-4">
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{t('withdraw.done')}</Alert>}
        <Field label={t('withdraw.amount')}>
          <input className="input" type="number" inputMode="decimal" step="0.01" min="1" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label={t('withdraw.method')}>
          <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value, destAccount: e.target.value === 'TELEBIRR' ? user?.phone ?? '' : '' })}>
            <option value="TELEBIRR">{t('provider.TELEBIRR')}</option>
            <option value="CBE">{t('provider.CBE')}</option>
          </select>
        </Field>
        <Field label={t('withdraw.account')}>
          <input className="input" required value={f.destAccount} onChange={(e) => setF({ ...f, destAccount: e.target.value })} inputMode="numeric" />
        </Field>
        <Field label={t('withdraw.name')} hint={t('withdraw.nameHint')}>
          <input className="input" required value={f.destName} onChange={(e) => setF({ ...f, destName: e.target.value })} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{t('withdraw.submit')}</button>
      </form>

      <div className="card">
        <h2 className="mb-2 font-semibold">{t('withdraw.recent')}</h2>
        {(list.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data!.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div>{birr(w.amountCents)} → {t(`provider.${w.method}` as Key)} {w.destAccount}</div>
                  <div className="text-xs text-slate-500">
                    {dateTime(w.createdAt)}
                    {w.transferRef && ` · ${t('withdraw.ref', { ref: w.transferRef })}`}
                    {w.rejectReason && ` · ${w.rejectReason}`}
                  </div>
                </div>
                <StatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function Withdraw() {
  return <RequireLogin><WithdrawInner /></RequireLogin>;
}
