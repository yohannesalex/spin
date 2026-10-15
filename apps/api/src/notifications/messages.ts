import type { Language } from '@prisma/client';

// REQ-NOT-02: every SMS exists in English and Amharic, chosen by the user's language.
type Params = Record<string, string | number>;
const T: Record<string, Record<Language, string>> = {
  otp: {
    en: 'Spin Draw code: {code}. Valid 5 minutes. Never share it.',
    am: 'የSpin Draw ኮድ: {code}። ለ5 ደቂቃ ያገለግላል። ለማንም አያጋሩ።',
  },
  password_changed: {
    en: 'Your Spin Draw password was changed. If this was not you, contact support now.',
    am: 'የSpin Draw የይለፍ ቃልዎ ተቀይሯል። እርስዎ ካልሆኑ አሁኑኑ ድጋፍ ያግኙ።',
  },
  account_locked: {
    en: 'Your Spin Draw account was locked for 15 minutes after 5 failed logins.',
    am: 'ከ5 ያልተሳኩ ሙከራዎች በኋላ የSpin Draw መለያዎ ለ15 ደቂቃ ተቆልፏል።',
  },
  you_won: {
    en: 'Congratulations! You won {amount} on Spin Draw (number {number}).',
    am: 'እንኳን ደስ አለዎት! በSpin Draw {amount} አሸንፈዋል (ቁጥር {number})።',
  },
  withdrawal_paid: {
    en: 'Your withdrawal of {amount} was paid. Ref: {ref}.',
    am: 'የ{amount} ወጪ ተከፍሏል። ማጣቀሻ: {ref}።',
  },
  withdrawal_rejected: {
    en: 'Your withdrawal of {amount} was rejected: {reason}. The amount is back in your wallet.',
    am: 'የ{amount} ወጪ ጥያቄዎ ውድቅ ሆኗል: {reason}። ገንዘቡ ወደ ቦርሳዎ ተመልሷል።',
  },
  account_banned: {
    en: 'Your Spin Draw account has been banned: {reason}.',
    am: 'የSpin Draw መለያዎ ታግዷል: {reason}።',
  },
  account_unbanned: {
    en: 'Your Spin Draw account has been restored.',
    am: 'የSpin Draw መለያዎ ተመልሷል።',
  },
};

export function sms(key: keyof typeof T, lang: Language, params: Params = {}): string {
  const tpl = T[key][lang] ?? T[key].en;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}
