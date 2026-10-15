'use client';
import { useState } from 'react';
import { ActionButton } from '@/components/admin';
import { Spinner, Stat } from '@/components/ui';
import { birr, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function Reports() {
  const rec = useApi<any>('/admin/reports/reconciliation');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const range = `from=${from}&to=${to}T23:59:59`;
  const commission = useApi<{ day: string; commissionCents: number; games: number }[]>(`/admin/reports/commission?${range}`);
  const [year, setYear] = useState(new Date().getFullYear());
  const tax = useApi<any[]>(`/admin/reports/tax?year=${year}`);

  const maxC = Math.max(1, ...(commission.data ?? []).map((d) => d.commissionCents));
  const totalC = (commission.data ?? []).reduce((s, d) => s + d.commissionCents, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Daily reconciliation</h2>
          <ActionButton label="Enter today's balances" className="btn-primary btn-sm" path="/admin/reports/reconciliation" noReason
            extra={[{ name: 'telebirr', label: 'Actual Telebirr balance (birr)', type: 'number', required: true }, { name: 'cbe', label: 'Actual CBE balance (birr)', type: 'number', required: true }, { name: 'note', label: 'Note', type: 'textarea' }]}
            transform={(v) => ({ telebirr: Number(v.telebirr), cbe: Number(v.cbe), note: v.note || undefined })} onDone={rec.reload} />
        </div>
        {!rec.data ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Player wallets" value={birr(rec.data.totals.walletsCents)} />
              <Stat label="Locked (pending payouts)" value={birr(rec.data.totals.lockedCents)} />
              <Stat label="House commission" value={birr(rec.data.totals.houseCents)} tone="gold" />
              <Stat label="Platform should hold" value={birr(rec.data.totals.expectedHoldingsCents)} sub={rec.data.totals.ledgerMatchesWallets ? '✔ ledger matches wallet balances' : '✘ LEDGER MISMATCH'} tone={rec.data.totals.ledgerMatchesWallets ? undefined : 'red'} />
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Date</th><th>Telebirr</th><th>CBE</th><th>Expected</th><th>Difference</th><th>Note</th></tr></thead>
                <tbody>
                  {rec.data.history.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.date}<div className="text-xs text-slate-500">{dateTime(r.createdAt)}</div></td>
                      <td>{birr(r.telebirrCents)}</td><td>{birr(r.cbeCents)}</td>
                      <td>{birr(r.walletsCents + r.lockedCents + r.houseCents)}</td>
                      <td className={r.differenceCents !== 0 ? 'font-bold text-red-600' : 'text-emerald-600'}>{birr(r.differenceCents, { sign: true })}</td>
                      <td className="text-slate-600">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Commission revenue</h2>
          <input type="date" className="input max-w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input max-w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="text-sm text-slate-600">Total <b className="text-gold-700">{birr(totalC)}</b></span>
        </div>
        <div className="card">
          {!commission.data ? <Spinner /> : commission.data.length === 0 ? <p className="text-slate-500">No commission in this range.</p> : (
            <div className="space-y-1">
              {commission.data.map((d) => (
                <div key={d.day} className="grid grid-cols-[90px_1fr_130px] items-center gap-2 text-sm">
                  <span className="text-slate-600">{d.day}</span>
                  <div className="h-4 rounded bg-slate-100"><div className="h-4 rounded bg-gold-400" style={{ width: `${(d.commissionCents / maxC) * 100}%` }} /></div>
                  <span className="text-right tabular-nums">{birr(d.commissionCents)} <span className="text-xs text-slate-500">({d.games})</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {['deposits', 'withdrawals', 'ledger', 'games', 'commission'].map((k) => (
            <a key={k} className="btn-secondary btn-sm" href={`/api/admin/reports/export/${k}?${range}`}>Export {k} (CSV)</a>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Tax report</h2>
          <input type="number" className="input max-w-[110px]" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        {!tax.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Month</th><th>Stakes</th><th>Refunds</th><th>Prizes</th><th>Gross gaming revenue</th><th>Deposits</th><th>Withdrawals</th></tr></thead>
              <tbody>
                {tax.data.map((m) => (
                  <tr key={m.month}><td>{m.month}</td><td>{birr(m.stakesCents)}</td><td>{birr(m.refundsCents)}</td><td>{birr(m.prizesCents)}</td><td className="font-semibold text-gold-700">{birr(m.grossGamingRevenueCents)}</td><td>{birr(m.depositsCents)}</td><td>{birr(m.withdrawalsCents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
