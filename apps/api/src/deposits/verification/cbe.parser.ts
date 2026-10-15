import { clean, eatToIso, parseAmountCents, ParsedReceipt } from './parsed-receipt';

/** CBE "10/15/2026, 2:30:05 PM" (m/d/yyyy, 12-hour, Ethiopian time). */
export function parseCbeDate(s: string | null): string | null {
  const m = s && /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s);
  if (!m) return null;
  let h = +m[4];
  if (m[7]) {
    const pm = m[7].toUpperCase() === 'PM';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return eatToIso(+m[3], +m[1], +m[2], h, +m[5], +(m[6] ?? 0));
}

const val = (re: RegExp, text: string) => re.exec(text)?.[1] ?? null;

/**
 * Parses the text of a CBE receipt PDF (apps.cbe.com.et:100/?id=…). Labels follow the
 * open-source @jvhaile/cbe-verifier: "Payer X  Account 1****1234  Receiver Y  Account 1****5678
 * Payment Date & Time …  Reference No. (VAT Invoice No) FT…  Transferred Amount 3,500.00 ETB".
 */
export function parseCbeText(raw: string): ParsedReceipt {
  const text = raw.replace(/\r/g, '');
  const flat = text.replace(/\s+/g, ' ');
  const name = /([A-Za-z][A-Za-z .'-]*?)/.source;
  const acct = /(\d[\d*]{3,}\d)/.source;
  const payerName = val(new RegExp(`\\bPayer:?\\s*${name}\\s*Account`), flat);
  const payerAccount = val(new RegExp(`\\bPayer:?\\s*[^]*?Account:?\\s*${acct}`), flat);
  const receiverName = val(new RegExp(`\\bReceiver:?\\s*${name}\\s*Account`), flat);
  const receiverAccount = val(new RegExp(`\\bReceiver:?\\s*[^]*?Account:?\\s*${acct}`), flat);
  const amount =
    val(/Transferred\s*Amount:?\s*(?:ETB\s*)?([\d,]+\.\d{2})/i, flat) ??
    val(/Amount:?\s*([\d,]+\.\d{2})\s*ETB/i, flat) ??
    val(/ETB\s*([\d,]+\.\d{2})/, flat);
  const date = val(/Payment\s*Date\s*(?:&|and)?\s*Time:?\s*([\d/]+,?\s*[\d:]+\s*(?:AM|PM)?)/i, flat);
  const reference = val(/Reference\s*No\.?\s*(?:\(VAT Invoice No\))?:?\s*(FT[A-Z0-9]{10})/i, flat) ?? val(/\b(FT[A-Z0-9]{10})\b/, flat);
  const parsed = {
    reference,
    payerName: clean(payerName),
    payerAccount,
    receiverName: clean(receiverName),
    receiverAccount,
    amountCents: parseAmountCents(amount),
    date: parseCbeDate(date),
    status: null as string | null,
  };
  // CBE only issues a receipt PDF for completed transfers.
  parsed.status = parsed.reference && parsed.amountCents != null ? 'Completed' : null;
  return parsed;
}

export async function parseCbePdf(pdf: Buffer): Promise<{ text: string; parsed: ParsedReceipt }> {
  // Import the library entry directly: pdf-parse's index runs a debug harness when required bare.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
  const { text } = await pdfParse(pdf);
  return { text, parsed: parseCbeText(text) };
}
