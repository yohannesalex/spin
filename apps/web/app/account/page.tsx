'use client';
import { useRouter } from 'next/navigation';
import { LanguageSwitch } from '@/components/Header';
import { RequireLogin } from '@/components/RequireLogin';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function Account() {
  const { t } = useI18n();
  const { user, reload } = useAuth();
  const router = useRouter();
  return (
    <RequireLogin>
      <main className="mx-auto max-w-md space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold">{t('account.title')}</h1>
        <div className="card space-y-1">
          <div className="text-lg font-semibold">{user?.fullName}</div>
          <div className="text-gray-400">{user?.phone}</div>
        </div>
        <div className="card flex items-center justify-between">
          <span>{t('account.language')}</span>
          <LanguageSwitch />
        </div>
        <button
          className="btn-secondary w-full"
          onClick={async () => {
            await api('/auth/logout-all', { method: 'POST' });
            await reload();
            router.push('/login');
          }}
        >
          {t('account.logoutAll')}
        </button>
      </main>
    </RequireLogin>
  );
}
