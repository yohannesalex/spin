'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Field, Modal, Spinner } from './ui';

const NAV = [
  ['/admin', 'Dashboard'],
  ['/admin/deposits', 'Deposits'],
  ['/admin/payouts', 'Payouts'],
  ['/admin/users', 'Users'],
  ['/admin/games', 'Games'],
  ['/admin/reports', 'Reports'],
  ['/admin/settings', 'Settings'],
  ['/admin/audit', 'Audit log'],
  ['/admin/admins', 'Admin accounts'],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [alerts, setAlerts] = useState(0);
  const ok = user && user.role !== 'PLAYER' && user.twoFactor;

  useEffect(() => {
    if (!loading && !ok) router.replace('/admin/login');
  }, [loading, ok, router]);
  useEffect(() => {
    if (!ok) return;
    const load = () => api<{ unread: number }>('/notifications').then((n) => setAlerts(n.unread)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [ok]);

  if (loading || !ok) return <Spinner />;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-ink-800 bg-ink-900 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin" className="font-bold">Spin Draw <span className="text-gold-400">Admin</span></Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
          {NAV.map(([href, label]) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? 'bg-ink-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden space-y-2 px-4 py-4 text-xs text-gray-500 lg:block">
          <Link href="/admin/alerts" className="block text-gray-300">🔔 Alerts {alerts > 0 && <span className="badge bg-red-600 text-white">{alerts}</span>}</Link>
          <div>{user.fullName}</div>
          <button className="text-red-300" onClick={async () => { await logout(); router.push('/admin/login'); }}>Log out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}

export interface ExtraField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'datetime-local' | 'file' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}

/**
 * Every admin action needs a reason (§7). This button opens a dialog collecting the reason
 * (and any extra fields), then calls the API.
 */
export function ActionButton({
  label, title, path, extra = [], className = 'btn-secondary btn-sm', confirmLabel = 'Confirm', onDone, transform, reasonLabel = 'Reason (written to the audit log)', noReason = false, multipart = false,
}: {
  label: string;
  title?: string;
  path: string;
  extra?: ExtraField[];
  className?: string;
  confirmLabel?: string;
  onDone?: (result: unknown) => void;
  transform?: (values: Record<string, string>) => Record<string, unknown>;
  reasonLabel?: string;
  noReason?: boolean;
  multipart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setValues(Object.fromEntries(extra.map((f) => [f.name, f.defaultValue ?? ''])));
    setError(null);
    setFile(null);
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = transform ? transform(values) : values;
      let body: unknown = v;
      if (multipart) {
        const fd = new FormData();
        for (const [k, val] of Object.entries(v)) if (val !== '' && val != null) fd.set(k, String(val));
        if (file) fd.set('receipt', file);
        body = fd;
      }
      const r = await api(path, { method: 'POST', body });
      setOpen(false);
      onDone?.(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={className} onClick={start}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? label}>
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          {extra.map((f) => (
            <Field key={f.name} label={f.label} hint={f.hint}>
              {f.type === 'select' ? (
                <select className="input" value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                  {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'file' ? (
                <input className="input" type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              ) : f.type === 'textarea' ? (
                <textarea className="input" rows={3} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              ) : (
                <input className="input" type={f.type ?? 'text'} step={f.type === 'number' ? '0.01' : undefined} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </Field>
          ))}
          {!noReason && (
            <Field label={reasonLabel}>
              <textarea className="input" rows={2} value={values.reason ?? ''} onChange={(e) => setValues({ ...values, reason: e.target.value })} />
            </Field>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary flex-1" onClick={submit} disabled={busy || (!noReason && (values.reason ?? '').trim().length < 3) || extra.some((f) => f.required && f.type !== 'file' && !values[f.name])}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <div className="mt-2 text-xs text-gray-500">{total} result(s)</div>;
  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span className="text-gray-500">Page {page} / {pages} · {total} results</span>
      <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto rounded-lg bg-ink-950 p-3 text-xs text-gray-300">{JSON.stringify(value, null, 2)}</pre>;
}
