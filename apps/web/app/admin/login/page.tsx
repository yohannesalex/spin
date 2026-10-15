'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// REQ-ROLE-02: password, then an OTP sent to the admin's phone.
export default function AdminLogin() {
  const router = useRouter();
  const { reload } = useAuth();
  const [phone, setPhone] = useState('+251 ');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!challenge) {
        const r = await api<{ twoFactorRequired: boolean; challenge: string }>('/auth/admin/login', { body: { phone, password } });
        setChallenge(r.challenge);
      } else {
        await api('/auth/admin/2fa', { body: { challenge, code } });
        await reload();
        router.push('/admin');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Admin sign-in</h1>
      <form onSubmit={submit} className="card space-y-4">
        {error && <Alert>{error}</Alert>}
        {!challenge ? (
          <>
            <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
            <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
          </>
        ) : (
          <Field label="Code sent to your phone" hint="Valid for 5 minutes">
            <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          </Field>
        )}
        <button className="btn-primary w-full" disabled={busy}>{challenge ? 'Verify' : 'Continue'}</button>
      </form>
    </main>
  );
}
