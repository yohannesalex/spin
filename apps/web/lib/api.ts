import { deviceFingerprint } from './fingerprint';
import { currentLang, serverText } from './locale';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
  get code(): string | undefined {
    return this.body.code as string | undefined;
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'spin' }, credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Adds an Idempotency-Key header (REQ-SEC-02). Pass a stable key to make retries safe. */
  idempotencyKey?: string;
  raw?: boolean;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { 'X-Requested-With': 'spin' };
  const fp = deviceFingerprint();
  if (fp) headers['X-Device-Fingerprint'] = fp;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  }).catch(() => {
    throw new ApiError(0, currentLang() === 'am' ? 'የኔትወርክ ችግር። ግንኙነትዎን አረጋግጠው እንደገና ይሞክሩ።' : 'Network error. Check your connection and try again.');
  });

  // Access tokens live 15 minutes; transparently rotate the refresh token once.
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, opts, true);
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const body = typeof data === 'object' && data ? data : {};
    const msg = Array.isArray(body.message) ? body.message.map(serverText).join('. ') : serverText(body.message || res.statusText);
    throw new ApiError(res.status, msg, body);
  }
  return data as T;
}

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
