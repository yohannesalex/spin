'use client';
import { useEffect } from 'react';
import { RequireLogin } from '@/components/RequireLogin';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

interface N { id: string; title: string; body: string; readAt: string | null; createdAt: string }

function List() {
  const { t } = useI18n();
  const { data, loading } = useApi<{ items: N[]; unread: number }>('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }, [data]);
  if (loading) return <Spinner />;
  if (!data?.items.length) return <p className="text-gray-500">{t('common.noNotifications')}</p>;
  return (
    <ul className="space-y-2">
      {data.items.map((n) => (
        <li key={n.id} className={`card ${!n.readAt ? 'border-gold-400/50' : ''}`}>
          <div className="flex justify-between gap-2">
            <b>{n.title}</b>
            <span className="shrink-0 text-xs text-gray-500">{dateTime(n.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm text-gray-300">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Notifications() {
  const { t } = useI18n();
  return (
    <RequireLogin>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">{t('nav.notifications')}</h1>
        <List />
      </main>
    </RequireLogin>
  );
}
