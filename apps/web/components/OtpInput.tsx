'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** 6-digit code field with the 60-second resend cooldown from §3.2. */
export function OtpInput({ value, onChange, phone, purpose }: { value: string; onChange: (v: string) => void; phone: string; purpose: 'REGISTER' | 'RESET' }) {
  const { t } = useI18n();
  const [cooldown, setCooldown] = useState(60);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  return (
    <div>
      <input
        className="input text-center text-2xl tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label={t('auth.code')}
      />
      <div className="mt-2 text-right text-sm">
        {cooldown > 0 ? (
          <span className="text-slate-500">{t('auth.resendIn', { s: cooldown })}</span>
        ) : (
          <button
            type="button"
            className="text-gold-700 hover:underline"
            onClick={async () => {
              setMsg(null);
              try {
                await api('/auth/otp/resend', { body: { phone, purpose } });
                setCooldown(60);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            {t('auth.resend')}
          </button>
        )}
        {msg && <div className="mt-1 text-red-600">{msg}</div>}
      </div>
    </div>
  );
}
