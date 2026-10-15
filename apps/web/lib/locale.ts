// Current UI language for code outside React (amount formatting, API errors), plus Amharic
// for text that comes from the server: error messages, notifications, flag labels, notes.
// Server strings are matched exactly as the API writes them; unknown text is shown unchanged.

export type Lang = 'en' | 'am';

let current: Lang = 'en';
export const setCurrentLang = (l: Lang) => {
  current = l;
};
export const currentLang = () => current;

/** "1,600 birr" → "1,600 ብር" */
const amt = (s: string) => s.replace(/\bbirr\b/g, 'ብር');

const EXACT: Record<string, string> = {
  // Auth and OTP
  'Bot check failed': 'የቦት ማረጋገጫው አልተሳካም',
  'Enter a valid Ethiopian mobile number (+251 9… or +251 7…)': 'ትክክለኛ የኢትዮጵያ ሞባይል ቁጥር ያስገቡ (+251 9… ወይም +251 7…)',
  'This phone number is already registered': 'ይህ ስልክ ቁጥር አስቀድሞ ተመዝግቧል',
  'Nothing to verify for this number': 'ለዚህ ቁጥር የሚረጋገጥ ነገር የለም',
  'Code expired. Request a new one.': 'ኮዱ ጊዜው አልፎበታል። አዲስ ይጠይቁ።',
  'Incorrect code': 'የተሳሳተ ኮድ',
  'Too many wrong attempts. Request a new code.': 'ብዙ የተሳሳቱ ሙከራዎች። አዲስ ኮድ ይጠይቁ።',
  'Too many codes requested. Try again later.': 'ብዙ ኮዶች ተጠይቀዋል። ቆይተው እንደገና ይሞክሩ።',
  'Wrong phone number or password': 'የተሳሳተ ስልክ ቁጥር ወይም የይለፍ ቃል',
  'Too many failed attempts. Account locked for 15 minutes.': 'ብዙ ያልተሳኩ ሙከራዎች። መለያው ለ15 ደቂቃ ተቆልፏል።',
  'Your account is banned': 'መለያዎ ታግዷል',
  'This account is disabled': 'ይህ መለያ ተሰናክሏል',
  'Admins sign in through the admin portal': 'አስተዳዳሪዎች በአስተዳዳሪ መግቢያ በኩል ይገባሉ',
  'Not an admin account': 'የአስተዳዳሪ መለያ አይደለም',
  'Login expired, start again': 'የመግቢያ ጊዜው አልፏል፣ እንደገና ይጀምሩ',
  'If an account exists for this number, we sent a code.': 'በዚህ ቁጥር መለያ ካለ ኮድ ልከናል።',
  'Password needs at least 8 characters, including a letter and a digit': 'የይለፍ ቃል ቢያንስ 8 ፊደላት፣ ፊደልና ቁጥር ያካተተ መሆን አለበት',
  'You must be 18 or older': '18 ዓመት ወይም ከዚያ በላይ መሆን አለብዎት',
  'You must accept the terms': 'ውሎቹን መቀበል አለብዎት',
  'Verify your phone number first': 'መጀመሪያ ስልክ ቁጥርዎን ያረጋግጡ',
  'Not logged in': 'አልገቡም',
  'Your account is suspended pending review': 'መለያዎ ለግምገማ ታግዷል',
  'Missing CSRF header': 'ጥያቄው አልተሳካም። ገጹን አድሰው እንደገና ይሞክሩ።',
  'Bad origin': 'ጥያቄው አልተሳካም። ገጹን አድሰው እንደገና ይሞክሩ።',
  'Not allowed': 'አልተፈቀደም',
  // Games
  'Room not found': 'ክፍሉ አልተገኘም',
  'Game not found': 'ጨዋታው አልተገኘም',
  'This room is closed': 'ይህ ክፍል ተዘግቷል',
  'This room is full': 'ይህ ክፍል ሞልቷል',
  'You already have a number in this room': 'በዚህ ክፍል ውስጥ አስቀድመው ቁጥር አለዎት',
  'Number taken, pick another': 'ቁጥሩ ተይዟል፣ ሌላ ይምረጡ',
  'Your balance is below the stake. Deposit to play.': 'ቀሪ ሂሳብዎ ከመወራረጃው ያነሰ ነው። ለመጫወት ገቢ ያድርጉ።',
  'Admins cannot play': 'አስተዳዳሪዎች መጫወት አይችሉም',
  'Insufficient balance': 'በቂ ቀሪ ሂሳብ የለም',
  'Request already in progress': 'ጥያቄው በሂደት ላይ ነው',
  'Idempotency key reused for a different request': 'ጥያቄው አልተሳካም። እንደገና ይሞክሩ።',
  'Not enough players before the deadline': 'ከጊዜ ገደቡ በፊት በቂ ተጫዋቾች አልተገኙም',
  // Deposits
  'Upload the receipt or paste its link / reference': 'ደረሰኙን ይጫኑ ወይም ሊንኩን / የግብይት ቁጥሩን ይለጥፉ',
  'Only JPG or PNG images are accepted': 'JPG ወይም PNG ምስሎች ብቻ ይቀበላሉ',
  'The image could not be read': 'ምስሉ ሊነበብ አልቻለም',
  'Too many deposits this hour. Try again later.': 'በዚህ ሰዓት ብዙ ገቢዎች ተደርገዋል። ቆይተው እንደገና ይሞክሩ።',
  'This receipt reference was already credited to another deposit': 'ይህ ደረሰኝ ለሌላ ገቢ አስቀድሞ ጥቅም ላይ ውሏል',
  'Deposit already credited': 'ገቢው አስቀድሞ ገብቷል',
  'Already credited': 'አስቀድሞ ገብቷል',
  // Deposit flag labels
  'Duplicate receipt': 'የተደገመ ደረሰኝ',
  'Wrong receiver': 'የተሳሳተ ተቀባይ',
  'Not completed': 'ያልተጠናቀቀ',
  'Amount mismatch': 'መጠኑ አይመሳሰልም',
  'Stale or invalid date': 'ያለፈ ወይም ልክ ያልሆነ ቀን',
  'Sender mismatch': 'ላኪው አይመሳሰልም',
  'Receipt not found at provider': 'ደረሰኙ በአገልግሎት ሰጪው ዘንድ አልተገኘም',
  'Over limit': 'ከገደቡ በላይ',
  'Unreadable': 'የማይነበብ',
  'Provider unavailable': 'አገልግሎት ሰጪው አይገኝም',
  'Receipt could not be parsed': 'ደረሰኙ ሊነበብ አልቻለም',
  // Withdrawals
  'Withdrawals are paused for 24 hours after a password reset': 'የይለፍ ቃል ከተቀየረ በኋላ ለ24 ሰዓት ወጪ ማድረግ አይቻልም',
  'The destination account name must match your registered name': 'የተቀባዩ መለያ ስም ከተመዘገቡበት ስም ጋር መመሳሰል አለበት',
  'Enter a valid CBE account number': 'ትክክለኛ የCBE መለያ ቁጥር ያስገቡ',
  'Enter the Telebirr phone number (+251 9… / +251 7…)': 'የቴሌብር ስልክ ቁጥሩን ያስገቡ (+251 9… / +251 7…)',
  'Enter a valid account or phone number': 'ትክክለኛ የመለያ ወይም የስልክ ቁጥር ያስገቡ',
  'Wallet not found': 'ቦርሳው አልተገኘም',
  // Platform
  'The platform is under maintenance. Please try again soon.': 'መድረኩ በጥገና ላይ ነው። እባክዎ ቆይተው ይሞክሩ።',
  'ThrottlerException: Too Many Requests': 'በጣም ብዙ ጥያቄዎች። ትንሽ ቆይተው እንደገና ይሞክሩ።',
  'Too Many Requests': 'በጣም ብዙ ጥያቄዎች። ትንሽ ቆይተው እንደገና ይሞክሩ።',
  'Internal server error': 'ችግር ተፈጥሯል። እንደገና ይሞክሩ።',
  'Internal Server Error': 'ችግር ተፈጥሯል። እንደገና ይሞክሩ።',
  // Notification titles and bodies
  'You won!': 'አሸንፈዋል!',
  'Room cancelled': 'ክፍሉ ተሰርዟል',
  'Deposit credited': 'ገቢው ገብቷል',
  'Deposit rejected': 'ገቢው ውድቅ ሆኗል',
  'Deposit under review': 'ገቢው በግምገማ ላይ ነው',
  'We need more information': 'ተጨማሪ መረጃ ያስፈልገናል',
  'Account locked': 'መለያው ተቆልፏል',
  'Your account was locked for 15 minutes after 5 failed logins.': 'ከ5 ያልተሳኩ የመግቢያ ሙከራዎች በኋላ መለያዎ ለ15 ደቂቃ ተቆልፏል።',
  'Password changed': 'የይለፍ ቃል ተቀይሯል',
  'Your password was changed and all devices were signed out.': 'የይለፍ ቃልዎ ተቀይሯል፤ ከሁሉም መሳሪያዎች ወጥተዋል።',
  'Account under review': 'መለያው በግምገማ ላይ ነው',
  'Your account is suspended while we review recent activity.': 'የቅርብ ጊዜ እንቅስቃሴዎን እስክንገመግም ድረስ መለያዎ ታግዷል።',
  'Balance adjusted': 'ቀሪ ሂሳብ ተስተካክሏል',
  'Withdrawal rejected': 'ወጪው ውድቅ ሆኗል',
  'Withdrawal paid': 'ወጪው ተከፍሏል',
};

const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Please wait (\d+)s before requesting another code$/, (s) => `ሌላ ኮድ ከመጠየቅዎ በፊት ${s} ሰከንድ ይጠብቁ`],
  [/^Account locked\. Try again in (\d+) minute\(s\)\.$/, (m) => `መለያው ተቆልፏል። ከ${m} ደቂቃ በኋላ እንደገና ይሞክሩ።`],
  [/^Minimum withdrawal is (.+)$/, (a) => `ዝቅተኛው የወጪ መጠን ${amt(a)} ነው`],
  [/^Daily withdrawal limit is (.+)$/, (a) => `የዕለት የወጪ ገደብ ${amt(a)} ነው`],
  [/^Number (\d+) won$/, (n) => `ቁጥር ${n} አሸንፏል`],
  [/^You won (.+) with number (\d+)\.$/, (a, n) => `በቁጥር ${n} ${amt(a)} አሸንፈዋል።`],
  [/^Your number (\d+) didn't win this time\.$/, (n) => `ቁጥርዎ ${n} በዚህ ጊዜ አላሸነፈም።`],
  [/^The room was cancelled \((.+)\)\. Your (.+) stake was refunded\.$/, (r, a) => `ክፍሉ ተሰርዟል (${serverText(r)})። የ${amt(a)} መወራረጃዎ ተመልሷል።`],
  [/^Your (.+) deposit was rejected: (.+)\.$/, (a, r) => `የ${amt(a)} ገቢዎ ውድቅ ሆኗል: ${r.split(', ').map(serverText).join('፣ ')}።`],
  [/^Your deposit was rejected: (.+)$/, (r) => `ገቢዎ ውድቅ ሆኗል: ${serverText(r)}`],
  [/^Your (.+) deposit needs a quick manual check\. We'll update you soon\.$/, (a) => `የ${amt(a)} ገቢዎ አጭር የእጅ ማረጋገጫ ያስፈልገዋል። በቅርቡ እናሳውቅዎታለን።`],
  [/^(.+) was added to your wallet\.$/, (a) => `${amt(a)} ወደ ቦርሳዎ ገብቷል።`],
  [/^An admin adjusted your balance by (.+?): (.+)$/, (a, r) => `አስተዳዳሪ ቀሪ ሂሳብዎን በ${amt(a)} አስተካክሏል: ${r}`],
  [/^Your (.+) withdrawal was rejected: (.+)\. The amount is back in your wallet\.$/, (a, r) => `የ${amt(a)} ወጪዎ ውድቅ ሆኗል: ${r}። ገንዘቡ ወደ ቦርሳዎ ተመልሷል።`],
  [/^(.+) was sent to your (CBE account|Telebirr)\. Ref: (.+)$/, (a, to, ref) => `${amt(a)} ወደ ${to === 'Telebirr' ? 'ቴሌብርዎ' : 'የCBE መለያዎ'} ተልኳል። ማጣቀሻ: ${ref}`],
  // Wallet ledger notes
  [/^Number (\d+)$/, (n) => `ቁጥር ${n}`],
  [/^Pay winner now: game (.+)$/, (g) => `ለአሸናፊው አሁን ክፈል: ጨዋታ ${g}`],
];

/** Translates a message written by the API into the current language. */
export function serverText(text: string | null | undefined): string {
  if (!text) return text ?? '';
  if (current === 'en') return text;
  if (EXACT[text]) return EXACT[text];
  for (const [re, fn] of PATTERNS) {
    const m = text.match(re);
    if (m) return fn(...m.slice(1));
  }
  return text;
}
