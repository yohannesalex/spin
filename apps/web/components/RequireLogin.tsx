'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Alert, Spinner } from './ui';

export function RequireLogin({ children, player = true }: { children: ReactNode; player?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  if (loading || !user) return <Spinner />;
  if (player && user.role !== 'PLAYER') {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <Alert kind="info">Admins cannot play. Use the admin portal.</Alert>
      </main>
    );
  }
  return (
    <>
      {user.status === 'SUSPENDED' && (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <Alert kind="warn">Your account is suspended pending review. Playing, deposits and withdrawals are paused.</Alert>
        </div>
      )}
      {children}
    </>
  );
}
