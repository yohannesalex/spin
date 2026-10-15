'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Spinner, Stat } from '@/components/ui';
import { birr } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Period { depositsCents: number; depositsCount: number; withdrawalsCents: number; withdrawalsCount: number; stakesCents: number; prizesCents: number; commissionCents: number; activePlayers: number }
interface Dash { periods: Record<'today' | 'last7' | 'last30', Period>; openRooms: number; pendingFlags: number; pendingHighFlags: number; pendingPayouts: { count: number; cents: number; overdue: number } }

export default function Dashboard() {
  const { data } = useApi<Dash>('/admin/dashboard');
  const [period, setPeriod] = useState<'today' | 'last7' | 'last30'>('today');
  if (!data) return <Spinner />;
  const p = data.periods[period];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex rounded-xl border border-slate-200 p-1 text-sm">
          {(['today', 'last7', 'last30'] as const).map((k) => (
            <button key={k} onClick={() => setPeriod(k)} className={`rounded-lg px-3 py-1 ${period === k ? 'bg-gold-400 text-slate-900' : 'text-slate-700'}`}>
              {k === 'today' ? 'Today' : k === 'last7' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Deposits" value={birr(p.depositsCents)} sub={`${p.depositsCount} credited`} />
        <Stat label="Withdrawals paid" value={birr(p.withdrawalsCents)} sub={`${p.withdrawalsCount} paid`} />
        <Stat label="Stakes" value={birr(p.stakesCents)} />
        <Stat label="Prizes" value={birr(p.prizesCents)} />
        <Stat label="Commission" value={birr(p.commissionCents)} tone="gold" />
        <Stat label="Active players" value={p.activePlayers} />
        <Stat label="Open rooms" value={data.openRooms} />
      </div>
      <h2 className="text-lg font-semibold">Needs attention</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/admin/deposits"><Stat label="Open flags" value={data.pendingFlags} sub={`${data.pendingHighFlags} high severity`} tone={data.pendingHighFlags ? 'red' : undefined} /></Link>
        <Link href="/admin/payouts"><Stat label="Pending payouts" value={data.pendingPayouts.count} sub={birr(data.pendingPayouts.cents)} /></Link>
        <Link href="/admin/payouts"><Stat label="Payouts > 24h" value={data.pendingPayouts.overdue} tone={data.pendingPayouts.overdue ? 'red' : 'green'} /></Link>
      </div>
    </div>
  );
}
