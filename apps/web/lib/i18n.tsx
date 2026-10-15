'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// REQ-UX-02: English and Amharic, switchable at any time.
// Amharic strings should be reviewed by a native speaker before launch (M5).
const en = {
  'nav.lobby': 'Lobby',
  'nav.wallet': 'Wallet',
  'nav.deposit': 'Deposit',
  'nav.withdraw': 'Withdraw',
  'nav.games': 'My games',
  'nav.rules': 'Rules',
  'nav.login': 'Log in',
  'nav.register': 'Sign up',
  'nav.account': 'Account',
  'nav.logout': 'Log out',
  'nav.notifications': 'Notifications',

  'home.title': 'Pick a number. Spin the wheel. Win 80% of the pot.',
  'home.subtitle': 'Every player picks a unique number from 1–100. One number is drawn fairly from the numbers taken, and its holder wins.',
  'home.open': 'Open rooms',
  'home.none': 'No open rooms right now. Check back soon.',

  'room.stake': 'Stake',
  'room.players': 'Players',
  'room.prizeIfFull': 'Prize if full',
  'room.timeLeft': 'Time left',
  'room.noDeadline': 'Draws when full',
  'room.join': 'Join',
  'room.view': 'View',
  'room.odds': 'Your odds',
  'room.pick': 'Pick your number',
  'room.yourNumber': 'Your number',
  'room.taken': 'Taken',
  'room.available': 'Available',
  'room.confirm': 'Pay {stake} and take number {number}?',
  'room.confirmBtn': 'Pay and take it',
  'room.cancel': 'Cancel',
  'room.numberTaken': 'Number taken, pick another',
  'room.lowBalance': 'Your balance is below the stake.',
  'room.depositNow': 'Deposit now',
  'room.loginToPlay': 'Log in to pick a number',
  'room.waiting': 'Waiting for players…',
  'room.startsIn': 'Spin starts in',
  'room.youWon': 'You won {amount}!',
  'room.numberWon': 'Number {number} won',
  'room.verify': 'Verify this game',
  'room.cancelled': 'This room was cancelled. All stakes were refunded.',
  'room.backToLobby': 'Back to lobby',
  'room.fairness': 'Fairness hash',
  'room.mute': 'Mute',
  'room.unmute': 'Sound on',

  'wallet.balance': 'Available balance',
  'wallet.locked': 'Locked (pending withdrawals)',
  'wallet.withdrawable': 'Withdrawable now',
  'wallet.pendingDeposits': 'Pending deposits',
  'wallet.pendingWithdrawals': 'Pending withdrawals',
  'wallet.history': 'History',
  'wallet.allTypes': 'All types',
  'wallet.from': 'From',
  'wallet.to': 'To',
  'wallet.empty': 'No transactions yet.',

  'deposit.title': 'Deposit',
  'deposit.step1': '1. Send money to this account',
  'deposit.step2': '2. Tell us what you sent',
  'deposit.accountName': 'Account name',
  'deposit.accountNumber': 'Account number',
  'deposit.limits': 'Min {min} · Max {max}',
  'deposit.amount': 'Amount you sent (birr)',
  'deposit.receipt': 'Receipt screenshot or photo (with the QR code)',
  'deposit.orPaste': 'Or paste the receipt link / transaction reference',
  'deposit.submit': 'Submit deposit',
  'deposit.verifying': 'Verifying your receipt…',
  'deposit.credited': 'Credited to your wallet',
  'deposit.review': 'Under review — an admin will check it shortly',
  'deposit.rejected': 'Rejected',
  'deposit.recent': 'Recent deposits',
  'deposit.noAccounts': 'Deposits are temporarily unavailable.',

  'withdraw.title': 'Withdraw',
  'withdraw.amount': 'Amount (birr)',
  'withdraw.method': 'Send to',
  'withdraw.account': 'Telebirr number / CBE account',
  'withdraw.name': 'Account holder name',
  'withdraw.nameHint': 'Must match your registered name',
  'withdraw.submit': 'Request withdrawal',
  'withdraw.done': 'Request received. We pay within 24 hours.',
  'withdraw.recent': 'Your withdrawals',

  'auth.fullName': 'Full name (as on your Telebirr/CBE account)',
  'auth.phone': 'Phone number',
  'auth.password': 'Password',
  'auth.newPassword': 'New password',
  'auth.passwordHint': 'At least 8 characters, with a letter and a digit',
  'auth.age': 'I confirm I am 18 years or older',
  'auth.terms': 'I accept the terms and rules',
  'auth.register': 'Create account',
  'auth.login': 'Log in',
  'auth.forgot': 'Forgot password?',
  'auth.noAccount': "Don't have an account?",
  'auth.haveAccount': 'Already registered?',
  'auth.otpTitle': 'Enter the code',
  'auth.otpSent': 'We sent a 6-digit code to {phone}.',
  'auth.code': '6-digit code',
  'auth.verify': 'Verify',
  'auth.resend': 'Resend code',
  'auth.resendIn': 'Resend in {s}s',
  'auth.resetTitle': 'Reset password',
  'auth.sendCode': 'Send code',
  'auth.resetDone': 'Password changed. All devices were signed out — log in again.',
  'auth.banned': 'Your account is banned.',
  'auth.reason': 'Reason',
  'auth.until': 'Until',

  'account.title': 'Account',
  'account.language': 'Language',
  'account.logoutAll': 'Log out of all devices',

  'games.title': 'My games',
  'games.empty': "You haven't played yet.",
  'games.won': 'Won',
  'games.lost': 'Lost',
  'games.open': 'Open',
  'games.refunded': 'Refunded',

  'rules.title': 'Rules',

  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
  'common.save': 'Save',
  'common.status': 'Status',
  'common.date': 'Date',
  'common.amount': 'Amount',
  'common.type': 'Type',
  'common.prev': 'Previous',
  'common.next': 'Next',
  'common.markAllRead': 'Mark all read',
  'common.noNotifications': 'No notifications.',
  'common.maintenance': 'The platform is under maintenance. Games and payments are paused.',
};

type Key = keyof typeof en;

const am: Partial<Record<Key, string>> = {
  'nav.lobby': 'ሎቢ',
  'nav.wallet': 'ቦርሳ',
  'nav.deposit': 'ገቢ',
  'nav.withdraw': 'ወጪ',
  'nav.games': 'የኔ ጨዋታዎች',
  'nav.rules': 'ደንቦች',
  'nav.login': 'ግባ',
  'nav.register': 'ተመዝገብ',
  'nav.account': 'መለያ',
  'nav.logout': 'ውጣ',
  'nav.notifications': 'ማሳወቂያዎች',

  'home.title': 'ቁጥር ይምረጡ። መንኮራኩሩን ያሽከርክሩ። የጠቅላላውን 80% ያሸንፉ።',
  'home.subtitle': 'እያንዳንዱ ተጫዋች ከ1–100 ልዩ ቁጥር ይመርጣል። ከተያዙት ቁጥሮች አንዱ በፍትሃዊነት ይወጣል፤ ባለቤቱም ያሸንፋል።',
  'home.open': 'ክፍት ክፍሎች',
  'home.none': 'አሁን ክፍት ክፍል የለም። በቅርቡ ይመለሱ።',

  'room.stake': 'መወራረጃ',
  'room.players': 'ተጫዋቾች',
  'room.prizeIfFull': 'ሲሞላ ሽልማት',
  'room.timeLeft': 'የቀረው ጊዜ',
  'room.noDeadline': 'ሲሞላ ይወጣል',
  'room.join': 'ተቀላቀል',
  'room.view': 'እይ',
  'room.odds': 'የማሸነፍ ዕድልዎ',
  'room.pick': 'ቁጥርዎን ይምረጡ',
  'room.yourNumber': 'የእርስዎ ቁጥር',
  'room.taken': 'የተያዘ',
  'room.available': 'ክፍት',
  'room.confirm': '{stake} ከፍለው ቁጥር {number} ይውሰዱ?',
  'room.confirmBtn': 'ክፈልና ውሰድ',
  'room.cancel': 'ተው',
  'room.numberTaken': 'ቁጥሩ ተይዟል፣ ሌላ ይምረጡ',
  'room.lowBalance': 'ቀሪ ሂሳብዎ ከመወራረጃው ያነሰ ነው።',
  'room.depositNow': 'አሁን ገቢ ያድርጉ',
  'room.loginToPlay': 'ቁጥር ለመምረጥ ይግቡ',
  'room.waiting': 'ተጫዋቾችን በመጠበቅ ላይ…',
  'room.startsIn': 'ማሽከርከር የሚጀምረው በ',
  'room.youWon': '{amount} አሸንፈዋል!',
  'room.numberWon': 'ቁጥር {number} አሸንፏል',
  'room.verify': 'ይህን ጨዋታ ያረጋግጡ',
  'room.cancelled': 'ይህ ክፍል ተሰርዟል። ሁሉም መወራረጃዎች ተመልሰዋል።',
  'room.backToLobby': 'ወደ ሎቢ ተመለስ',
  'room.fairness': 'የፍትሃዊነት ሃሽ',
  'room.mute': 'ድምፅ አጥፋ',
  'room.unmute': 'ድምፅ አብራ',

  'wallet.balance': 'ያለ ቀሪ ሂሳብ',
  'wallet.locked': 'የተያዘ (በመጠባበቅ ላይ ያሉ ወጪዎች)',
  'wallet.withdrawable': 'አሁን ማውጣት የሚቻል',
  'wallet.pendingDeposits': 'በመጠባበቅ ላይ ያሉ ገቢዎች',
  'wallet.pendingWithdrawals': 'በመጠባበቅ ላይ ያሉ ወጪዎች',
  'wallet.history': 'ታሪክ',
  'wallet.allTypes': 'ሁሉም ዓይነቶች',
  'wallet.from': 'ከ',
  'wallet.to': 'እስከ',
  'wallet.empty': 'እስካሁን ምንም ግብይት የለም።',

  'deposit.title': 'ገቢ',
  'deposit.step1': '1. ወደዚህ መለያ ገንዘብ ይላኩ',
  'deposit.step2': '2. የላኩትን ይንገሩን',
  'deposit.accountName': 'የመለያ ስም',
  'deposit.accountNumber': 'የመለያ ቁጥር',
  'deposit.limits': 'ዝቅተኛ {min} · ከፍተኛ {max}',
  'deposit.amount': 'የላኩት መጠን (ብር)',
  'deposit.receipt': 'የደረሰኝ ምስል (QR ኮዱ የሚታይበት)',
  'deposit.orPaste': 'ወይም የደረሰኙን ሊንክ / የግብይት ቁጥር ይለጥፉ',
  'deposit.submit': 'ገቢ አስገባ',
  'deposit.verifying': 'ደረሰኝዎ እየተረጋገጠ ነው…',
  'deposit.credited': 'ወደ ቦርሳዎ ገብቷል',
  'deposit.review': 'በግምገማ ላይ — አስተዳዳሪ በቅርቡ ያያል',
  'deposit.rejected': 'ውድቅ ሆኗል',
  'deposit.recent': 'የቅርብ ጊዜ ገቢዎች',
  'deposit.noAccounts': 'ገቢ ለጊዜው አይገኝም።',

  'withdraw.title': 'ወጪ',
  'withdraw.amount': 'መጠን (ብር)',
  'withdraw.method': 'የሚላክበት',
  'withdraw.account': 'የቴሌብር ቁጥር / የCBE መለያ',
  'withdraw.name': 'የመለያው ባለቤት ስም',
  'withdraw.nameHint': 'ከተመዘገቡበት ስም ጋር መመሳሰል አለበት',
  'withdraw.submit': 'ወጪ ጠይቅ',
  'withdraw.done': 'ጥያቄዎ ደርሷል። በ24 ሰዓት ውስጥ እንከፍላለን።',
  'withdraw.recent': 'የእርስዎ ወጪዎች',

  'auth.fullName': 'ሙሉ ስም (በቴሌብር/CBE መለያዎ ላይ እንዳለው)',
  'auth.phone': 'ስልክ ቁጥር',
  'auth.password': 'የይለፍ ቃል',
  'auth.newPassword': 'አዲስ የይለፍ ቃል',
  'auth.passwordHint': 'ቢያንስ 8 ፊደላት፣ ፊደልና ቁጥር ያካተተ',
  'auth.age': '18 ዓመት ወይም ከዚያ በላይ መሆኔን አረጋግጣለሁ',
  'auth.terms': 'ውሎቹንና ደንቦቹን እቀበላለሁ',
  'auth.register': 'መለያ ፍጠር',
  'auth.login': 'ግባ',
  'auth.forgot': 'የይለፍ ቃል ረሱ?',
  'auth.noAccount': 'መለያ የለዎትም?',
  'auth.haveAccount': 'ተመዝግበዋል?',
  'auth.otpTitle': 'ኮዱን ያስገቡ',
  'auth.otpSent': 'ባለ 6 አሃዝ ኮድ ወደ {phone} ልከናል።',
  'auth.code': 'ባለ 6 አሃዝ ኮድ',
  'auth.verify': 'አረጋግጥ',
  'auth.resend': 'ኮድ እንደገና ላክ',
  'auth.resendIn': 'በ{s} ሰከንድ እንደገና ይላኩ',
  'auth.resetTitle': 'የይለፍ ቃል ቀይር',
  'auth.sendCode': 'ኮድ ላክ',
  'auth.resetDone': 'የይለፍ ቃል ተቀይሯል። ከሁሉም መሳሪያዎች ወጥተዋል — እንደገና ይግቡ።',
  'auth.banned': 'መለያዎ ታግዷል።',
  'auth.reason': 'ምክንያት',
  'auth.until': 'እስከ',

  'account.title': 'መለያ',
  'account.language': 'ቋንቋ',
  'account.logoutAll': 'ከሁሉም መሳሪያዎች ውጣ',

  'games.title': 'የኔ ጨዋታዎች',
  'games.empty': 'እስካሁን አልተጫወቱም።',
  'games.won': 'አሸንፈዋል',
  'games.lost': 'አልተሳካም',
  'games.open': 'ክፍት',
  'games.refunded': 'ተመልሷል',

  'rules.title': 'ደንቦች',

  'common.loading': 'በመጫን ላይ…',
  'common.error': 'ችግር ተፈጥሯል',
  'common.save': 'አስቀምጥ',
  'common.status': 'ሁኔታ',
  'common.date': 'ቀን',
  'common.amount': 'መጠን',
  'common.type': 'ዓይነት',
  'common.prev': 'ቀዳሚ',
  'common.next': 'ቀጣይ',
  'common.markAllRead': 'ሁሉንም እንደተነበበ ምልክት አድርግ',
  'common.noNotifications': 'ምንም ማሳወቂያ የለም።',
  'common.maintenance': 'መድረኩ በጥገና ላይ ነው። ጨዋታዎችና ክፍያዎች ለጊዜው ቆመዋል።',
};

export type Lang = 'en' | 'am';
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, params?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sd_lang');
      if (saved === 'am' || saved === 'en') setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('sd_lang', l);
    } catch {}
  }, []);
  const t = useCallback(
    (k: Key, params?: Record<string, string | number>) => {
      const s = (lang === 'am' ? am[k] : undefined) ?? en[k] ?? k;
      return params ? s.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? '')) : s;
    },
    [lang],
  );
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const c = useContext(I18nContext);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
