'use client';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function Alerts() {
  const { data } = useApi<{ items: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[]; unread: number }>('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }, [data]);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Alerts</h1>
      {data.items.length === 0 && <p className="text-gray-500">No alerts.</p>}
      {data.items.map((n) => (
        <div key={n.id} className={`card ${!n.readAt ? 'border-red-500/50' : ''}`}>
          <div className="flex justify-between"><b>{n.title}</b><span className="text-xs text-gray-500">{dateTime(n.createdAt)}</span></div>
          <p className="text-sm text-gray-300">{n.body}</p>
        </div>
      ))}
    </div>
  );
}
