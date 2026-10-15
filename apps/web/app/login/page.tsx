'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';
  const { reload } = useAuth();
  const [phone, setPhone] = useState('+251 ');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ban, setBan] = useState<{ banReason?: string; bannedUntil?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setBan(null);
    try {
      const r = await api<{ verificationRequired?: boolean; phone?: string }>('/auth/login', { body: { phone, password } });
      if (r.verificationRequired) return router.push(`/verify?phone=${encodeURIComponent(r.phone!)}`);
      await reload();
      router.push(next.startsWith('/') ? next : '/');
    } catch (err) {
      // REQ-AUTH-07: banned users see the reason.
      if (err instanceof ApiError && err.body.banReason) setBan(err.body as never);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('nav.login')}</h1>
      <form onSubmit={submit} className="card space-y-4">
        {error && <Alert>{error}</Alert>}
        {ban && (
          <Alert>
            <b>{t('auth.banned')}</b>
            <div>{t('auth.reason')}: {ban.banReason}</div>
            {ban.bannedUntil && <div>{t('auth.until')}: {dateTime(ban.bannedUntil)}</div>}
          </Alert>
        )}
        <Field label={t('auth.phone')}>
          <input className="input" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </Field>
        <Field label={t('auth.password')}>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{t('auth.login')}</button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot" className="text-slate-600 hover:text-slate-900">{t('auth.forgot')}</Link>
          <Link href="/register" className="text-gold-700">{t('nav.register')}</Link>
        </div>
      </form>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
