'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
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
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
      {(['en', 'am'] as const).map((l) => (
        <button key={l} onClick={() => change(l)} className={`rounded-md px-2.5 py-1 transition ${lang === l ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {l === 'en' ? 'EN' : 'አማ'}
        </button>
      ))}
    </div>
  );
}

const icon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS: Record<string, ReactNode> = {
  '/': icon(<><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4" /></>),
  '/wallet': icon(<><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 13h2M3 10h18M7 6V4h10v2" /></>),
  '/deposit': icon(<><path d="M12 5v14M5 12h14" /></>),
  '/withdraw': icon(<><path d="M12 19V5M5 12l7-7 7 7" /></>),
  '/games': icon(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  '/rules': icon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" /><path d="M20 17v4H6.5a2.5 2.5 0 0 1 0-5" /></>),
};

function useNavLinks() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isPlayer = user?.role === 'PLAYER';
  return [
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
}

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const links = useNavLinks();
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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:h-16 sm:gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="hidden min-[380px]:inline">Spin Draw</span>
        </Link>
        <nav className="ml-4 hidden gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${pathname === l.href ? 'bg-gold-100 text-gold-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isPlayer && balance != null && (
            <Link href="/wallet" className="rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5 text-sm font-bold tabular-nums text-gold-800">
              {birr(balance)}
            </Link>
          )}
          {isPlayer && (
            <Link href="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t('nav.notifications')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          <div className="hidden sm:block">
            <LanguageSwitch />
          </div>
          {!user ? (
            <>
              <Link href="/login" className="btn-secondary btn-sm">{t('nav.login')}</Link>
              <Link href="/register" className="btn-primary btn-sm">{t('nav.register')}</Link>
            </>
          ) : (
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white"
              onClick={() => setMenu((m) => !m)}
              aria-label={t('common.menu')}
              aria-expanded={menu}
            >
              {user.fullName.trim().charAt(0).toUpperCase()}
            </button>
          )}
        </div>
      </div>
      {menu && user && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden="true" tabIndex={-1} onClick={() => setMenu(false)} />
          <div className="absolute right-4 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift">
            <div className="border-b border-slate-100 px-3 pb-3 pt-2 text-sm">
              <div className="font-semibold">{user.fullName}</div>
              <div className="text-slate-500">{user.phone}</div>
            </div>
            <div className="px-3 py-2 sm:hidden"><LanguageSwitch /></div>
            {user.role !== 'PLAYER' && <Link href="/admin" className="block rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100">{t('nav.adminPortal')}</Link>}
            <Link href="/account" className="block rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100">{t('nav.account')}</Link>
            {isPlayer && <Link href="/rules" className="block rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100 md:hidden">{t('nav.rules')}</Link>}
            <button
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        </>
      )}
    </header>
  );
}

/** Mobile tab bar. Rendered after the page content so its spacer keeps the last content visible. */
export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  // Players get five tabs; Rules moves into the account menu to keep the bar uncluttered.
  const links = useNavLinks().filter((l) => !(user?.role === 'PLAYER' && l.href === '/rules'));
  if (pathname.startsWith('/admin')) return null;
  return (
    <>
      <div className="h-[calc(4.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-gold-700' : 'text-slate-500'}`}>
                <span className={`rounded-full px-4 py-0.5 ${active ? 'bg-gold-100' : ''}`}>{ICONS[l.href]}</span>
                <span className="max-w-full truncate px-1">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
