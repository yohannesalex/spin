'use client';
import Link from 'next/link';
import { useState } from 'react';
import { RequireLogin } from '@/components/RequireLogin';
import { Spinner, Stat, StatusBadge } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

interface Summary {
  balanceCents: number;
  lockedCents: number;
  withdrawableCents: number;
  pendingDeposits: { id: string; provider: string; claimedAmountCents: number; status: string; createdAt: string }[];
  pendingWithdrawals: { id: string; method: string; amountCents: number; status: string; createdAt: string }[];
}
interface Entry { id: string; type: string; amountCents: number; note: string | null; createdAt: string; refType: string; refId: string }

const TYPES = ['DEPOSIT', 'STAKE', 'PRIZE', 'REFUND', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADMIN_ADJUSTMENT'];

function WalletInner() {
  const { t } = useI18n();
  const { data } = useApi<Summary>('/wallet');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(type && { type }), ...(from && { from }), ...(to && { to: `${to}T23:59:59` }) });
  const history = useApi<{ items: Entry[]; total: number; pageSize: number }>(`/wallet/ledger?${qs}`);

  if (!data) return <Spinner />;
  const pages = history.data ? Math.max(1, Math.ceil(history.data.total / history.data.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('wallet.balance')} value={birr(data.balanceCents)} tone="gold" />
        <Stat label={t('wallet.withdrawable')} value={birr(data.withdrawableCents)} />
        <Stat label={t('wallet.locked')} value={birr(data.lockedCents)} />
      </div>
      <div className="flex gap-2">
        <Link href="/deposit" className="btn-primary flex-1">{t('nav.deposit')}</Link>
        <Link href="/withdraw" className="btn-secondary flex-1">{t('nav.withdraw')}</Link>
      </div>

      {(data.pendingDeposits.length > 0 || data.pendingWithdrawals.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card">
            <h3 className="mb-2 font-semibold">{t('wallet.pendingDeposits')}</h3>
            {data.pendingDeposits.map((d) => (
              <div key={d.id} className="flex justify-between py-1 text-sm">
                <span>{birr(d.claimedAmountCents)} · {d.provider}</span>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">{t('wallet.pendingWithdrawals')}</h3>
            {data.pendingWithdrawals.map((w) => (
              <div key={w.id} className="flex justify-between py-1 text-sm">
                <span>{birr(w.amountCents)} · {w.method}</span>
                <StatusBadge status={w.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="mb-3 font-semibold">{t('wallet.history')}</h3>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">{t('wallet.allTypes')}</option>
            {TYPES.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
          <input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label={t('wallet.from')} />
          <input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label={t('wallet.to')} />
        </div>
        {!history.data ? (
          <Spinner />
        ) : history.data.items.length === 0 ? (
          <p className="text-gray-500">{t('wallet.empty')}</p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {history.data.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{e.type.replace(/_/g, ' ').toLowerCase()}</div>
                  <div className="text-xs text-gray-500">
                    {dateTime(e.createdAt)}
                    {e.note && ` · ${e.note}`}
                    {e.refType === 'game' && <> · <Link className="underline" href={`/room/${e.refId}`}>game</Link></>}
                  </div>
                </div>
                <div className={`font-semibold tabular-nums ${e.amountCents >= 0 ? 'text-emerald-400' : 'text-gray-300'}`}>{birr(e.amountCents, { sign: true })}</div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
            <span className="text-gray-500">{page} / {pages}</span>
            <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Wallet() {
  return <RequireLogin><WalletInner /></RequireLogin>;
}
