import * as https from 'https';

export class ProviderUnavailableError extends Error {}
export class ReceiptNotFoundError extends Error {}

export interface FetchedReceipt {
  url: string;
  contentType: string;
  body: Buffer;
}

// A healthy receipt page answers in ~1 s, but the Telebirr site flaps: some requests hang until
// the timeout. Several short tries absorb that within one job attempt; the BullMQ backoff
// (REQ-DEP-05) is only the fallback for real outages.
const TIMEOUT_MS = 10_000;
const QUICK_TRIES = 3;
const QUICK_PAUSE_MS = 1_500;

/**
 * §4.3 step 4: fetch the official receipt. REQ-DEP-03: Telebirr blocks foreign IPs, so in
 * production either run this API on an Ethiopian server or set RECEIPT_RELAY_URL to a relay
 * inside Ethiopia that proxies GET ?url=<receipt url>.
 */
export async function fetchReceipt(url: string): Promise<FetchedReceipt> {
  return withQuickRetries(() => fetchOnce(url));
}

async function withQuickRetries(fn: () => Promise<FetchedReceipt>): Promise<FetchedReceipt> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ProviderUnavailableError) || i >= QUICK_TRIES) throw e;
      await new Promise((r) => setTimeout(r, QUICK_PAUSE_MS));
    }
  }
}

async function fetchOnce(url: string): Promise<FetchedReceipt> {
  const relay = process.env.RECEIPT_RELAY_URL;
  const target = relay ? `${relay}${relay.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}` : url;
  // apps.cbe.com.et:100 serves a certificate that does not validate; only for that host do we
  // skip verification. The content is still cross-checked against our own records.
  const insecure = !relay && new URL(url).hostname === 'apps.cbe.com.et';
  const { status, contentType, body } = await get(target, insecure);
  if (status === 404) throw new ReceiptNotFoundError('Receipt not found');
  if (status >= 500 || status === 403 || status === 429) throw new ProviderUnavailableError(`Provider returned HTTP ${status}`);
  if (status !== 200) throw new ReceiptNotFoundError(`Provider returned HTTP ${status}`);
  return { url, contentType, body };
}

// The public CBE receipt viewer (mbreciept.cbe.com.et) loads receipt data from this JSON API and
// sends these fixed app headers. They come from CBE's public web bundle; override them by env if
// CBE rotates them (symptom: HTTP 400 "Missing Headers" / every CBE link failing).
const CBE_DETAIL_API = 'https://Mb.cbe.com.et/api/v1/transactions/public/transaction-detail/';
const CBE_APP_ID = process.env.CBE_RECEIPT_APP_ID || 'd1292e42-7400-49de-a2d3-9731caa4c819';
const CBE_APP_VERSION = process.env.CBE_RECEIPT_APP_VERSION || '0a01980b-9859-1369-8198-59f403820000';

/** Receipt data behind a CBE short link (mbreciept.cbe.com.et/<code>), as JSON. */
export async function fetchCbeShortReceipt(code: string): Promise<FetchedReceipt> {
  const url = CBE_DETAIL_API + encodeURIComponent(code);
  return withQuickRetries(async () => {
    const { status, contentType, body } = await get(url, false, {
      Accept: 'application/json',
      'X-App-ID': CBE_APP_ID,
      'X-App-Version': CBE_APP_VERSION,
    });
    // Unknown or tampered codes come back as HTTP 500 "Invalid V2 token" / "Invalid … legacy token".
    if (status === 404 || (status === 500 && /invalid[^"]*token/i.test(body.toString('utf8')))) {
      throw new ReceiptNotFoundError('Receipt not found');
    }
    if (status !== 200) throw new ProviderUnavailableError(`CBE receipt API returned HTTP ${status}`);
    return { url, contentType, body };
  });
}

function get(url: string, insecure: boolean, extraHeaders: Record<string, string> = {}): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: TIMEOUT_MS, rejectUnauthorized: !insecure, headers: { 'User-Agent': 'Mozilla/5.0 SpinDrawVerifier/1.0', ...extraHeaders } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 5 * 1024 * 1024) req.destroy(new Error('Receipt too large'));
          else chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks) }),
        );
        res.on('error', (e) => reject(new ProviderUnavailableError(e.message)));
      },
    );
    req.on('timeout', () => req.destroy(new ProviderUnavailableError('Provider timed out')));
    req.on('error', (e) => reject(e instanceof ProviderUnavailableError ? e : new ProviderUnavailableError(e.message)));
  });
}
