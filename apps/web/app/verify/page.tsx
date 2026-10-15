'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { OtpInput } from '@/components/OtpInput';
import { Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

function VerifyInner() {
  const { t } = useI18n();
  const phone = useSearchParams().get('phone') || '';
  const router = useRouter();
  const { reload } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/register/verify', { body: { phone, code } });
      await reload();
      router.push('/deposit');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">{t('auth.otpTitle')}</h1>
      <p className="mb-6 text-gray-400">{t('auth.otpSent', { phone })}</p>
      <form onSubmit={submit} className="card space-y-4">
        {error && <Alert>{error}</Alert>}
        <OtpInput value={code} onChange={setCode} phone={phone} purpose="REGISTER" />
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{t('auth.verify')}</button>
      </form>
    </main>
  );
}

export default function Verify() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
