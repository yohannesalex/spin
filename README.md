# Spin Draw

A web spin-draw game. Each player pays a fixed stake from a prepaid wallet and picks a unique number from 1 to 100. A wheel draws one of the numbers players took. The player holding it wins 80% of the pot, and the house keeps 20%.

This is the v1 build of *Spin Draw Betting Platform — Requirements Specification* (Oct 15, 2026).

| Part | Stack |
|---|---|
| `apps/api` | NestJS 10, Prisma 5 + PostgreSQL 16, Socket.IO (Redis adapter), BullMQ + Redis, sharp / jsQR / Tesseract, cheerio / pdf-parse |
| `apps/web` | Next.js 14 (App Router), React 18, Tailwind CSS, Canvas wheel, PWA manifest |

## Quick start (development)

```bash
pnpm install
docker compose up -d postgres redis          # Postgres on :5433, Redis on :6380
cp apps/api/.env.example apps/api/.env       # then set JWT_ACCESS_SECRET (≥32 chars)
cp apps/web/.env.example apps/web/.env.local
pnpm --filter api exec prisma migrate deploy
pnpm db:seed                                 # admin +251911000000 / Admin12345, room templates, placeholder accounts
pnpm dev                                     # API :4000, web :3000
```

- Player site: http://localhost:3000
- Admin portal: http://localhost:3000/admin/login

In development, OTP codes are printed in the API console as `[DEV OTP] +2519…: 123456` (REQ-AUTH-10).

The seed creates **placeholder** receiving accounts. Replace them in **Admin → Settings → Receiving accounts** with the platform's real Telebirr and CBE accounts before any real deposit is taken.

### Tests

```bash
pnpm --filter api test        # unit tests: fairness, pot split, §4.4 matching rules, receipt parsers, phone normalisation
```

## How it fits together

```
Browser ──/api/*──▶ Next.js (rewrites) ──▶ NestJS API ──▶ PostgreSQL
   │                                          │  ├─ BullMQ ◀─▶ Redis   (deposit verification + retries)
   └──── Socket.IO (lobby, grid, spin) ───────┘  └─ receipt fetcher ──▶ Telebirr / CBE (needs an Ethiopian IP)
```

### Money

- **The ledger is the source of truth.** `ledger_entries` is append-only, and a DB trigger rejects UPDATE and DELETE on it. `wallets.balanceCents` is a cache that is updated in the same transaction as each entry, under `SELECT … FOR UPDATE`. A `CHECK` constraint stops a player balance from going below 0.
- Amounts are stored as integer santim. Prize = floor(pot × (1 − commission)), and the santim remainder goes to the house (`splitPot`).
- **Withdrawals:** a request moves money from Available to Locked. Marking it paid releases the lock. Rejecting it posts a `WITHDRAWAL_REVERSAL` entry.
- **Idempotency:** joins, deposits and withdrawals accept an `Idempotency-Key` header. A repeated key replays the first response.

### Game

- **Joining a room:** one transaction locks the room row, checks it is open and has space, inserts the entry (the DB has unique constraints on `(game, number)` and `(game, user)`), then debits the stake. If two players tap the same number, exactly one succeeds and the other is not charged.
- **Provably fair draw:** when a room opens, the server publishes `SHA-256(seed)`. The winner is
  `sorted[ BigInt(HMAC-SHA256(seed, gameId + ":" + sorted.join(","))) mod n ]`.
  The result and the settlement (prize credited to the winner, commission to the house) are written in one transaction before any animation starts. A DB trigger makes the result fields write-once, including for admins. `/verify/[id]` recomputes the result in the browser using WebCrypto.
- **Spin sync:** the server broadcasts `spinStartAt` (5 s countdown, then a 7 s spin). Each client works out the wheel angle from `serverNow − spinStartAt`, using a clock offset synced over the socket. All players therefore see the same frame, and anyone who reconnects jumps straight to the right point.

### Deposit verification (§4.3)

1. Get the reference from what the user pasted, otherwise from the QR code in the image (jsQR at several scales), otherwise by OCR (Tesseract). If none is found, the deposit is flagged *Unreadable*.
2. If the reference was already used, the deposit is rejected and a high-severity flag is raised. This applies across users, and `used_references` has a DB-level unique key.
3. Fetch the official receipt:
   - Telebirr: `transactioninfo.ethiotelecom.et/receipt/{ref}` returns HTML.
   - CBE: `apps.cbe.com.et:100/?id={FT ref}{last 8 digits}` returns a PDF. The last 8 digits can come from the payer's or the receiver's account, so the platform uses its own receiving account and the user doesn't need to enter anything.
4. Parse the receipt and apply the §4.4 rules: receiver, exact amount, date window, status, sender name (fuzzy match ≥ 85%) and limits.
5. If every rule passes, the wallet is credited automatically. Otherwise the deposit goes to *Under review* with the reasons, and appears in the admin queue.
6. If the provider can't be reached, BullMQ retries 3 times over about 9 minutes, then flags *Provider unavailable*.

The raw receipt, the parsed fields and the uploaded image are stored for every deposit (REQ-DEP-02).

## Requirements map

| Area | Where |
|---|---|
| Roles, admin 2FA, permission map for future roles (REQ-ROLE-*) | `common/permissions.ts`, `common/auth.guard.ts`, `auth/auth.service.ts` |
| Registration, OTP rules, lockout, sessions, reset (REQ-AUTH-*) | `auth/*` |
| Swappable SMS sender (REQ-AUTH-09) | `notifications/sms.provider.ts` (Console, AfroMessage, SMS Gateway for Android) |
| Ledger, wallet, holds (REQ-WAL-*, REQ-PAY-04) | `wallet/wallet.service.ts` |
| Deposits and verification (REQ-DEP-*) | `deposits/*`, `deposits/verification/*` |
| Auto-suspend after 3 high-severity flags in 30 days (REQ-DEP-07) | `flags/flags.service.ts` |
| Withdrawals, payout queue, "Pay winner now" (REQ-PAY-*) | `withdrawals/*`, `admin/admin-payouts.controller.ts` |
| Rooms, templates, deadlines, refunds (REQ-GAME-01..08) | `games/games.service.ts`, `games/games.scheduler.ts` |
| Fair draw and verify page (REQ-GAME-09..12) | `games/fairness.ts`, `web/app/verify/[id]` |
| Wheel / reel animation (REQ-ANIM-*) | `web/components/Wheel.tsx`, `web/app/room/[id]` |
| Admin portal (§7) | `api/src/admin/*`, `web/app/admin/*` |
| Notifications, Amharic and English SMS (§8) | `notifications/*` |
| Security: CSRF, rate limits, upload re-encoding, multi-account detection (§9.1) | `common/csrf.middleware.ts`, `@Throttle`, `deposits.service.ts`, `jobs/maintenance.service.ts` |
| Amharic and English UI (REQ-UX-02) | `web/lib/i18n.tsx` |

## Before go-live (open items)

- **Receipt fetching from Ethiopia (REQ-DEP-03).** The Telebirr receipt server times out from foreign IPs (confirmed during development). Either run the API on an Ethiopian VPS, or set `RECEIPT_RELAY_URL` to a relay inside Ethiopia that proxies `GET ?url=…`.
- **Real receipt samples (REQ-DEP-04).** The parsers follow the field labels used by the open-source `telebirr-receipt` and `@jvhaile/cbe-verifier` packages. The fixtures in `deposits/verification/__fixtures__` are synthetic. Add anonymised real Telebirr HTML and CBE PDF receipts and extend `parsers.spec.ts`.
- **SMS.** Set `SMS_PROVIDER=afromessage` and the `AFROMESSAGE_*` variables, or `SMS_PROVIDER=smsgate` and the `SMSGATE_*` variables to send from an Android phone's SIM via [SMS Gateway for Android](https://sms-gate.app).
- **Amharic text.** Have a native speaker review the Amharic strings in `web/lib/i18n.tsx` and `api/src/notifications/messages.ts`.
- **Production settings:** `COOKIE_SECURE=true`, HTTPS behind Cloudflare, and `WEB_ORIGIN` set to the real domain. Optionally add `TURNSTILE_SECRET` (bot protection on registration) and `TELEGRAM_*` (admin alerts).
- **File storage.** `StorageService` writes to local disk outside the web root. Replace it with an S3/R2 implementation if you run more than one API instance.
- **M5 hardening:** load test (2,000 users, 1,000 games), daily encrypted backups with monthly restore tests, and a penetration test.
- **Decisions from §12.3 that need confirming:**
  - Rooms with a deadline draw with the players present if the minimum is met; otherwise they refund.
  - Each player can take one number per room (enforced by a DB unique constraint).
  - Commission is set per template, with a configurable default of 20%.
