'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { OtpInput } from '@/components/OtpInput';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function Forgot() {
  const { t } = useI18n();
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState('+251 ');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('auth.resetTitle')}</h1>
      {step === 'phone' && (
        <form
          className="card space-y-4"
          onSubmit={run(async () => {
            await api('/auth/forgot', { body: { phone } });
            setInfo(t('auth.forgotSent'));
            setStep('code');
          })}
        >
          {error && <Alert>{error}</Alert>}
          <Field label={t('auth.phone')}>
            <input className="input" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>{t('auth.sendCode')}</button>
        </form>
      )}
      {step === 'code' && (
        <form
          className="card space-y-4"
          onSubmit={run(async () => {
            await api('/auth/reset', { body: { phone, code, password } });
            setStep('done');
          })}
        >
          {info && <Alert kind="info">{info}</Alert>}
          {error && <Alert>{error}</Alert>}
          <OtpInput value={code} onChange={setCode} phone={phone} purpose="RESET" />
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <button className="btn-primary w-full" disabled={busy || code.length < 4}>{t('auth.resetTitle')}</button>
        </form>
      )}
      {step === 'done' && (
        <div className="card space-y-4">
          <Alert kind="success">{t('auth.resetDone')}</Alert>
          <Link href="/login" className="btn-primary w-full">{t('nav.login')}</Link>
        </div>
      )}
    </main>
  );
}
