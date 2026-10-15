import * as https from 'https';

export class ProviderUnavailableError extends Error {}
export class ReceiptNotFoundError extends Error {}

export interface FetchedReceipt {
  url: string;
  contentType: string;
  body: Buffer;
}

const TIMEOUT_MS = 20_000;

/**
 * §4.3 step 4: fetch the official receipt. REQ-DEP-03: Telebirr blocks foreign IPs, so in
 * production either run this API on an Ethiopian server or set RECEIPT_RELAY_URL to a relay
 * inside Ethiopia that proxies GET ?url=<receipt url>.
 */
export async function fetchReceipt(url: string): Promise<FetchedReceipt> {
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

function get(url: string, insecure: boolean): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: TIMEOUT_MS, rejectUnauthorized: !insecure, headers: { 'User-Agent': 'Mozilla/5.0 SpinDrawVerifier/1.0' } },
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
