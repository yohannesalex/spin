'use client';
import { ReactNode, useEffect } from 'react';
import { Key, useI18n } from '@/lib/i18n';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift sm:rounded-2xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto -mt-1 mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  const cls = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
  }[kind];
  return <div className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  CREDITED: 'bg-emerald-100 text-emerald-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  SETTLED: 'bg-emerald-100 text-emerald-800',
  OPEN: 'bg-sky-100 text-sky-800',
  VERIFYING: 'bg-sky-100 text-sky-800',
  PENDING: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  FROZEN: 'bg-indigo-100 text-indigo-800',
  SUSPENDED: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-slate-200 text-slate-700',
  HIGH: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  BANNED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  RESOLVED: 'bg-slate-200 text-slate-700',
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useI18n();
  if (!status) return null;
  const key = `status.${status}` as Key;
  const label = t(key) === key ? status.replace(/_/g, ' ').toLowerCase() : t(key);
  return <span className={`badge ${STATUS_COLORS[status] ?? 'bg-slate-200 text-slate-700'}`}>{label}</span>;
}

export function Spinner() {
  const { t } = useI18n();
  return <div className="mx-auto my-8 h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-gold-500" aria-label={t('common.loading')} />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gold' | 'red' | 'green' }) {
  const color = tone === 'gold' ? 'text-gold-700' : tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="card h-full">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
