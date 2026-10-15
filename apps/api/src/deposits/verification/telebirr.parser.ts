import * as cheerio from 'cheerio';
import { clean, eatToIso, parseAmountCents, ParsedReceipt } from './parsed-receipt';

// Labels on transactioninfo.ethiotelecom.et/receipt/{ref}, compared with whitespace removed and
// lower-cased (same approach as the open-source `telebirr-receipt` parser).
const LABELS = {
  payerName: 'የከፋይስም/payername',
  payerPhone: 'የከፋይቴሌብርቁ./payertelebirrno.',
  receiverName: 'የገንዘብተቀባይስም/creditedpartyname',
  receiverAccount: 'የገንዘብተቀባይቴሌብርቁ./creditedpartyaccountno',
  status: 'የክፍያውሁኔታ/transactionstatus',
  bankAccount: 'የባንክአካውንትቁጥር/bankaccountnumber',
  receiptNo: 'የክፍያቁጥር/receiptno.',
  date: 'የክፍያቀን/paymentdate',
  settledAmount: 'የተከፈለውመጠን/settledamount',
  totalPaid: 'ጠቅላላየተክፈለ/totalamountpaid',
};
// The receipt no / date / settled amount are column headers of a 3-column table, so their
// value is in the row below: 3 cells further on.
const HEADER_LABELS = new Set([LABELS.receiptNo, LABELS.date, LABELS.settledAmount]);

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** Telebirr date "15-10-2026 14:23:45" (dd-mm-yyyy, Ethiopian time). */
export function parseTelebirrDate(s: string | null): string | null {
  const m = s && /(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  return m ? eatToIso(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] ?? 0)) : null;
}

export function parseTelebirrHtml(html: string): ParsedReceipt {
  const $ = cheerio.load(html);
  const cells = $('td')
    .toArray()
    .map((el) => clean($(el).text()) ?? '');
  const found: Record<string, string | null> = {};
  const wanted = Object.entries(LABELS);
  cells.forEach((text, i) => {
    const n = norm(text);
    for (const [key, label] of wanted) {
      if (n === label && !(key in found)) {
        found[key] = cells[i + (HEADER_LABELS.has(label) ? 3 : 1)] ?? null;
      }
    }
  });
  // Bank transfers via Telebirr show the receiving bank account instead of a telebirr number.
  let receiverAccount = found.receiverAccount ?? null;
  let receiverName = found.receiverName ?? null;
  if (!receiverAccount && found.bankAccount) {
    receiverAccount = found.bankAccount.replace(/[^\d*]/g, '') || null;
    receiverName = receiverName ?? clean(found.bankAccount.replace(/^[\d*\s]+/, ''));
  }
  return {
    reference: clean(found.receiptNo),
    payerName: clean(found.payerName),
    payerAccount: clean(found.payerPhone),
    receiverName: clean(receiverName),
    receiverAccount: clean(receiverAccount),
    amountCents: parseAmountCents(found.settledAmount ?? found.totalPaid),
    date: parseTelebirrDate(found.date ?? null),
    status: clean(found.status),
  };
}
