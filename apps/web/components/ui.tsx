'use client';
import { ReactNode, useEffect } from 'react';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-t-2xl border border-ink-700 bg-ink-900 p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  const cls = {
    error: 'border-red-800 bg-red-950/60 text-red-200',
    success: 'border-emerald-800 bg-emerald-950/60 text-emerald-200',
    info: 'border-sky-800 bg-sky-950/60 text-sky-200',
    warn: 'border-amber-800 bg-amber-950/60 text-amber-200',
  }[kind];
  return <div className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-900 text-emerald-200',
  CREDITED: 'bg-emerald-900 text-emerald-200',
  PAID: 'bg-emerald-900 text-emerald-200',
  SETTLED: 'bg-emerald-900 text-emerald-200',
  OPEN: 'bg-sky-900 text-sky-200',
  VERIFYING: 'bg-sky-900 text-sky-200',
  PENDING: 'bg-amber-900 text-amber-200',
  UNDER_REVIEW: 'bg-amber-900 text-amber-200',
  FROZEN: 'bg-indigo-900 text-indigo-200',
  SUSPENDED: 'bg-orange-900 text-orange-200',
  MEDIUM: 'bg-amber-900 text-amber-200',
  LOW: 'bg-ink-700 text-gray-300',
  HIGH: 'bg-red-900 text-red-200',
  REJECTED: 'bg-red-900 text-red-200',
  BANNED: 'bg-red-900 text-red-200',
  CANCELLED: 'bg-ink-700 text-gray-300',
  RESOLVED: 'bg-ink-700 text-gray-300',
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`badge ${STATUS_COLORS[status] ?? 'bg-ink-700 text-gray-300'}`}>{status.replace(/_/g, ' ').toLowerCase()}</span>;
}

export function Spinner() {
  return <div className="mx-auto my-8 h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-gold-400" aria-label="Loading" />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gold' | 'red' | 'green' }) {
  const color = tone === 'gold' ? 'text-gold-400' : tone === 'red' ? 'text-red-400' : tone === 'green' ? 'text-emerald-400' : 'text-gray-100';
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
