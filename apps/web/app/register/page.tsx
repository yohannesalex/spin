'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function Register() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({ fullName: '', phone: '+251 ', password: '', ageConfirmed: false, termsAccepted: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string }>('/auth/register', { body: { ...f, language: lang } });
      router.push(`/verify?phone=${encodeURIComponent(r.phone)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('nav.register')}</h1>
      <form onSubmit={submit} className="card space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t('auth.fullName')}>
          <input className="input" required minLength={3} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="name" />
        </Field>
        <Field label={t('auth.phone')}>
          <input className="input" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="+251 9XXXXXXXX" />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          <input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.ageConfirmed} onChange={(e) => setF({ ...f, ageConfirmed: e.target.checked })} required />
          {t('auth.age')}
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.termsAccepted} onChange={(e) => setF({ ...f, termsAccepted: e.target.checked })} required />
          <span>
            {t('auth.terms')} (<Link href="/rules" className="text-gold-700 underline">{t('nav.rules')}</Link>)
          </span>
        </label>
        <button className="btn-primary w-full" disabled={busy}>{t('auth.register')}</button>
        <p className="text-center text-sm text-slate-600">
          {t('auth.haveAccount')} <Link href="/login" className="text-gold-700">{t('nav.login')}</Link>
        </p>
      </form>
    </main>
  );
}
