'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface AlertItem {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data: { href?: string } | null;
}

export default function Alerts() {
  const { data } = useApi<{ items: AlertItem[]; unread: number }>('/notifications');
  // Remember which alerts were new when the page opened, so they stay highlighted after
  // being marked read.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data?.unread) return;
    setFresh(new Set(data.items.filter((n) => !n.readAt).map((n) => n.id)));
    api('/notifications/read-all', { method: 'POST' })
      .then(() => window.dispatchEvent(new Event('admin-alerts-read')))
      .catch(() => {});
  }, [data]);

  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Alerts</h1>
      {data.items.length === 0 && <p className="text-slate-500">No alerts.</p>}
      {data.items.map((n) => {
        const isNew = fresh.has(n.id);
        const body = (
          <>
            <div className="flex items-start justify-between gap-3">
              <b className="flex items-center gap-2">
                {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="new" />}
                {n.title}
              </b>
              <span className="shrink-0 text-xs text-slate-500">{dateTime(n.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{n.body}</p>
            {n.data?.href && <span className="mt-2 inline-block text-sm font-medium text-gold-700">Open →</span>}
          </>
        );
        const cls = `card block ${isNew ? 'border-red-300' : ''}`;
        return n.data?.href ? (
          <Link key={n.id} href={n.data.href} className={`${cls} transition hover:border-gold-400`}>{body}</Link>
        ) : (
          <div key={n.id} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}
