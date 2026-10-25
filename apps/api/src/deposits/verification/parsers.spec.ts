import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCbeJson, parseCbeText } from './cbe.parser';
import { extractReference } from './reference';
import { parseTelebirrHtml } from './telebirr.parser';

describe('Telebirr receipt parser', () => {
  it('parses the saved sample', () => {
    const html = readFileSync(join(__dirname, '__fixtures__/telebirr-receipt.html'), 'utf8');
    expect(parseTelebirrHtml(html)).toEqual({
      reference: 'CJF7ABC123',
      payerName: 'ABEBE KEBEDE TESFAYE',
      payerAccount: '2519****1111',
      receiverName: 'SPIN DRAW PLC',
      receiverAccount: '2519****5678',
      amountCents: 50000,
      date: '2026-10-15T11:23:45.000Z', // 14:23:45 EAT
      status: 'Completed',
    });
  });

  it('parses a real (anonymised) live receipt — "Invoice No." layout', () => {
    const html = readFileSync(join(__dirname, '__fixtures__/telebirr-live-2026-10.html'), 'utf8');
    expect(parseTelebirrHtml(html)).toEqual({
      reference: 'CJF7ABC123',
      payerName: 'ABEBE KEBEDE TESFAYE',
      payerAccount: '2519****1111',
      receiverName: 'SPIN DRAW PLC',
      receiverAccount: '2519****5678',
      amountCents: 100,
      date: '2026-10-18T12:37:06.000Z', // 15:37:06 EAT
      status: 'Completed',
    });
  });

  it('returns nulls for unrelated HTML rather than throwing', () => {
    expect(parseTelebirrHtml('<html><body>Not found</body></html>').amountCents).toBeNull();
  });
});

describe('CBE receipt parser', () => {
  const sample = `Commercial Bank of Ethiopia
VAT Invoice / Customer Receipt
Customer Name: ABEBE KEBEDE
Payment / Transaction Information
Payer ABEBE KEBEDE TESFAYE
Account 1****1234
Receiver SPIN DRAW PLC
Account 1****0001
Payment Date & Time 10/15/2026, 2:30:05 PM
Reference No. (VAT Invoice No) FT26288K7Q2M
Reason / Type of service deposit
Transferred Amount 3,500.00 ETB
Commission or Service Charge 0.00 ETB
Total amount debited from customers account 3,500.00 ETB`;

  it('parses the saved sample', () => {
    expect(parseCbeText(sample)).toEqual({
      reference: 'FT26288K7Q2M',
      payerName: 'ABEBE KEBEDE TESFAYE',
      payerAccount: '1****1234',
      receiverName: 'SPIN DRAW PLC',
      receiverAccount: '1****0001',
      amountCents: 350000,
      date: '2026-10-15T11:30:05.000Z',
      status: 'Completed',
    });
  });
});

describe('CBE short-link receipt (JSON)', () => {
  it('parses a real (anonymised) response from the CBE receipt API', () => {
    const json = JSON.parse(readFileSync(join(__dirname, '__fixtures__/cbe-short-link-2026-10.json'), 'utf8'));
    expect(parseCbeJson(json)).toEqual({
      reference: 'FT26291TEST1',
      payerName: 'ABEBE KEBEDE TESFAYE',
      payerAccount: '1********1234',
      receiverName: 'SPIN DRAW PLC',
      receiverAccount: '1********0001',
      amountCents: 1000, // credited amount, without the payer's 0.61 birr fees
      date: '2026-10-18T12:54:00.000Z',
      status: 'COMPLETED',
    });
  });
});

describe('extractReference', () => {
  it('reads CBE short receipt links, keeping the case-sensitive code', () => {
    expect(extractReference('https://mbreciept.cbe.com.et/v2-hfHCxHMq63oBJGTMAzyr')).toEqual({
      provider: 'CBE',
      reference: 'v2-hfHCxHMq63oBJGTMAzyr',
      cbeShortCode: 'v2-hfHCxHMq63oBJGTMAzyr',
    });
    expect(extractReference('Receipt: https://mbreceipt.cbe.com.et/AbC123xyz', 'TELEBIRR')).toMatchObject({ provider: 'CBE', cbeShortCode: 'AbC123xyz' });
  });

  it('reads Telebirr links and bare references', () => {
    expect(extractReference('https://transactioninfo.ethiotelecom.et/receipt/CJF7ABC123')).toEqual({ provider: 'TELEBIRR', reference: 'CJF7ABC123' });
    expect(extractReference('cjf7abc123', 'TELEBIRR')).toEqual({ provider: 'TELEBIRR', reference: 'CJF7ABC123' });
  });

  it('reads CBE links with the account suffix', () => {
    expect(extractReference('https://apps.cbe.com.et:100/?id=FT26288K7Q2M00000001')).toEqual({
      provider: 'CBE',
      reference: 'FT26288K7Q2M',
      cbeId: 'FT26288K7Q2M00000001',
    });
    expect(extractReference('FT26288K7Q2M')).toMatchObject({ provider: 'CBE', reference: 'FT26288K7Q2M' });
  });

  it('rejects junk', () => {
    expect(extractReference('hello world')).toBeNull();
  });
});
