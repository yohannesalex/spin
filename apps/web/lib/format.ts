import { currentLang } from './locale';

export function birr(cents: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (cents == null) return '—';
  const v = cents / 100;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}${s} ${currentLang() === 'am' ? 'ብር' : 'birr'}`;
}

export function dateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(currentLang() === 'am' ? 'am-ET' : 'en-GB', { timeZone: 'Africa/Addis_Ababa', dateStyle: 'medium', timeStyle: 'short' });
}

export function timeLeft(ms: number): string {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
