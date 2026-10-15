'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { birr } from '@/lib/format';
import { Lang, useI18n } from '@/lib/i18n';

export function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const change = (l: Lang) => {
    setLang(l);
    if (user) api('/auth/me/language', { method: 'PATCH', body: { language: l } }).catch(() => {});
  };
  return (
    <div className="flex overflow-hidden rounded-lg border border-ink-600 text-xs">
      {(['en', 'am'] as const).map((l) => (
        <button key={l} onClick={() => change(l)} className={`px-2 py-1 ${lang === l ? 'bg-gold-400 text-ink-950' : 'text-gray-300'}`}>
          {l === 'en' ? 'EN' : 'አማ'}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);

  const isPlayer = user?.role === 'PLAYER';
  useEffect(() => {
    if (!isPlayer) return;
    const load = () => {
      api<{ balanceCents: number }>('/wallet').then((w) => setBalance(w.balanceCents)).catch(() => {});
      api<{ unread: number }>('/notifications').then((n) => setUnread(n.unread)).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [isPlayer, pathname]);
  useEffect(() => setMenu(false), [pathname]);

  if (pathname.startsWith('/admin')) return null;

  const links = [
    { href: '/', label: t('nav.lobby') },
    ...(isPlayer
      ? [
          { href: '/wallet', label: t('nav.wallet') },
          { href: '/deposit', label: t('nav.deposit') },
          { href: '/withdraw', label: t('nav.withdraw') },
          { href: '/games', label: t('nav.games') },
        ]
      : []),
    { href: '/rules', label: t('nav.rules') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span>Spin Draw</span>
        </Link>
        <nav className="ml-4 hidden gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 text-sm ${pathname === l.href ? 'bg-ink-800 text-white' : 'text-gray-400 hover:text-white'}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {isPlayer && balance != null && (
            <Link href="/wallet" className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm font-semibold tabular-nums text-gold-400">
              {birr(balance)}
            </Link>
          )}
          {isPlayer && (
            <Link href="/notifications" className="relative rounded-lg p-1.5 text-gray-300 hover:bg-ink-800" aria-label={t('nav.notifications')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          <div className="hidden sm:block">
            <LanguageSwitch />
          </div>
          {!user ? (
            <>
              <Link href="/login" className="btn-secondary btn-sm">{t('nav.login')}</Link>
              <Link href="/register" className="btn-primary btn-sm hidden sm:inline-flex">{t('nav.register')}</Link>
            </>
          ) : (
            <button className="rounded-lg p-1.5 text-gray-300 hover:bg-ink-800" onClick={() => setMenu((m) => !m)} aria-label="Menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
        </div>
      </div>
      {/* Mobile nav */}
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${pathname === l.href ? 'bg-ink-800 text-white' : 'text-gray-400'}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      {menu && user && (
        <div className="absolute right-4 top-14 w-56 rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-xl">
          <div className="px-3 py-2 text-sm">
            <div className="font-semibold">{user.fullName}</div>
            <div className="text-gray-500">{user.phone}</div>
          </div>
          <div className="px-3 py-2 sm:hidden"><LanguageSwitch /></div>
          {user.role !== 'PLAYER' && <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm hover:bg-ink-800">Admin portal</Link>}
          <Link href="/account" className="block rounded-lg px-3 py-2 text-sm hover:bg-ink-800">{t('nav.account')}</Link>
          <button
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-ink-800"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </header>
  );
}
