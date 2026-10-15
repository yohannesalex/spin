// REQ-AUTH-01: Ethiopian mobile numbers normalised to E.164 (+2519XXXXXXXX / +2517XXXXXXXX).

export function normalizePhone(input: string): string | null {
  const digits = (input || '').replace(/[^\d+]/g, '');
  let local: string | null = null;
  if (/^\+251[79]\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^251[79]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[79]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[79]\d{8}$/.test(digits)) local = digits;
  return local ? `+251${local}` : null;
}

export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 6)}****${phone.slice(-3)}` : '****';
}
