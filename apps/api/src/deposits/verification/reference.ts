import { Provider } from '@prisma/client';

export interface ExtractedRef {
  provider: Provider;
  /** Telebirr: 10-char receipt no. CBE: FT + 10 chars. */
  reference: string;
  /** CBE only: full receipt id (FT ref + last 8 digits of an account) when the QR/link carried it. */
  cbeId?: string;
}

const TELEBIRR_URL = /transactioninfo\.ethiotelecom\.et\/receipt\/([A-Z0-9]{10})\b/i;
const CBE_URL = /apps\.cbe\.com\.et(?::\d+)?\/?\?id=(FT[A-Z0-9]{10})(\d{8})?/i;
const CBE_REF = /\b(FT[A-Z0-9]{10})(\d{8})?\b/i;
const TELEBIRR_REF = /^[A-Z0-9]{10}$/i;

/**
 * §4.3 step 2: extract provider + reference from decoded QR text, a pasted link, a pasted
 * reference, or OCR text. `hint` is the provider the user picked on the deposit form.
 */
export function extractReference(text: string, hint?: Provider): ExtractedRef | null {
  const s = (text || '').trim();
  if (!s) return null;
  let m = TELEBIRR_URL.exec(s);
  if (m) return { provider: 'TELEBIRR', reference: m[1].toUpperCase() };
  m = CBE_URL.exec(s);
  if (m) return { provider: 'CBE', reference: m[1].toUpperCase(), cbeId: m[2] ? `${m[1]}${m[2]}`.toUpperCase() : undefined };
  m = CBE_REF.exec(s);
  if (m && hint !== 'TELEBIRR') return { provider: 'CBE', reference: m[1].toUpperCase(), cbeId: m[2] ? `${m[1]}${m[2]}`.toUpperCase() : undefined };
  const compact = s.replace(/\s+/g, '');
  if (TELEBIRR_REF.test(compact) && /[A-Z]/i.test(compact) && /\d/.test(compact) && hint !== 'CBE') {
    return { provider: 'TELEBIRR', reference: compact.toUpperCase() };
  }
  return null;
}

/** OCR fallback: search free text for anything that looks like a reference. */
export function findReferenceInText(text: string, hint?: Provider): ExtractedRef | null {
  const direct = extractReference(text, hint);
  if (direct) return direct;
  if (hint === 'TELEBIRR') {
    // Receipt no. usually follows "Transaction ID" / "Receipt" / "ቁጥር" in the SMS / app screenshot.
    const m = /(?:transaction\s*(?:id|number|no\.?)|receipt\s*(?:no\.?|number)?|ቁጥር)\s*[:#]?\s*([A-Z0-9]{10})\b/i.exec(text);
    if (m && /[A-Z]/i.test(m[1]) && /\d/.test(m[1])) return { provider: 'TELEBIRR', reference: m[1].toUpperCase() };
  }
  return null;
}

export function receiptUrl(ref: ExtractedRef, accountSuffix8?: string): string {
  if (ref.provider === 'TELEBIRR') return `https://transactioninfo.ethiotelecom.et/receipt/${ref.reference}`;
  const id = ref.cbeId ?? `${ref.reference}${accountSuffix8 ?? ''}`;
  return `https://apps.cbe.com.et:100/?id=${id}`;
}
