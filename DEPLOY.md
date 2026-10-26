# Deploying Spin Draw (Vercel + Railway)

> Want free hosting? See **[DEPLOY-ORACLE.md](DEPLOY-ORACLE.md)**: everything on one free Oracle Cloud server, with automatic HTTPS.

| Part | Where | Why |
|---|---|---|
| Web app (`apps/web`, Next.js) | **Vercel** | Built for Next.js |
| API (`apps/api`, NestJS) | **Railway** | Needs an always-on server: WebSockets (live lobby and synced spin), the deposit worker, and the room-deadline timer. Vercel's serverless functions can't run these. |
| PostgreSQL + Redis | **Railway** | In the same private network as the API |

How requests flow: the browser loads pages from Vercel. Vercel forwards `/api/*` to Railway, so login cookies stay on your Vercel domain. The browser connects to Socket.IO directly on the Railway domain.

Do the steps in this order. You need the API's address before you configure Vercel, and Vercel's address before you finish the API.

---

## 0. Before you start

1. Create accounts on https://railway.com and https://vercel.com. Sign in to both with your GitHub account.
2. Push the latest code to GitHub (`yohannesalex/spin`):
   ```bash
   git add -A
   git commit -m "Prepare for deployment"
   git push
   ```
3. Generate a secret for login tokens and keep it for step 2.5:
   ```bash
   openssl rand -hex 32
   ```
4. Pick a strong admin password: at least 12 characters, with letters and digits. **Don't use `Admin12345` on a public server.**

---

## 1. Railway: create the database and Redis

1. Railway dashboard → **New Project** → **Deploy PostgreSQL**. The service is named **Postgres**.
2. In the same project: **+ Create** (or **+ New**) → **Database** → **Redis**. The service is named **Redis**.

Keep the default service names **Postgres** and **Redis**. The variables in step 2.5 refer to them by name.

---

## 2. Railway: deploy the API

1. In the same project: **+ Create** → **GitHub Repo** → `yohannesalex/spin`. If the repo isn't listed, click **Configure GitHub App** and give Railway access to it.
2. Open the new service → **Settings**:

   | Setting | Value |
   |---|---|
   | Service name | `api` (optional, for clarity) |
   | Root Directory | *leave empty*. The pnpm workspace needs the repository root. |
   | Custom Build Command | `pnpm install --frozen-lockfile && pnpm --filter api exec prisma generate && pnpm --filter api build` |
   | Custom Start Command | `pnpm --filter api exec prisma migrate deploy && pnpm --filter api start` |
   | Healthcheck Path | `/api/health` |
   | Watch Paths | `apps/api/**` (so changes to the web app alone don't redeploy the API) |

3. **Settings → Networking → Generate Domain.** You get an address like `https://spin-api-production.up.railway.app`. Write it down; this is your **API URL**.
4. Add storage for raw receipts and payout receipt images. Right-click the service, or open the command palette (Ctrl/⌘ + K), choose **Attach Volume**, and set the mount path to `/data`.
5. **Variables** tab → **Raw Editor** → paste this, then fill in the values in `< >`:

   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}?family=0
   JWT_ACCESS_SECRET=<the openssl output from step 0.3>
   WEB_ORIGIN=https://example.com
   COOKIE_SECURE=true
   TRUST_PROXY=2
   STORAGE_DIR=/data/storage
   SMS_PROVIDER=console

   # --- TESTING ONLY: remove these three before real launch (see section 6) ---
   NODE_ENV=staging
   OTP_FIXED_CODE=0000
   DEPOSIT_SIMULATION=true
   ```

   About these values:
   - `WEB_ORIGIN` is a placeholder for now. You set it to your Vercel address in step 4.
   - `?family=0` lets the Redis client use Railway's private (IPv6) network.
   - `TRUST_PROXY=2` is needed because requests pass through Vercel and then Railway. Without it, every player would share one IP address for login rate limits.
   - Don't set `PORT`. Railway sets it automatically.
   - `NODE_ENV=staging` is required while the testing flags are on. The API refuses to start with `OTP_FIXED_CODE` or `DEPOSIT_SIMULATION` set if `NODE_ENV=production`.

6. Click **Deploy** (or **Apply changes**). Watch **Deployments → View logs**. A successful start shows:
   ```
   WARN [Bootstrap] OTP_FIXED_CODE is set: every OTP is "0000" and no SMS is sent
   WARN [Bootstrap] DEPOSIT_SIMULATION is on: ...
   LOG  [Bootstrap] API listening on :XXXX
   ```
7. Open `https://<your API URL>/api/health` in a browser. You should see `{"ok":true,...}`.

---

## 3. Create the admin account and default games (one time)

The database is empty. Run the seed script once **from your own computer** against the Railway database:

1. In Railway, open the **Postgres** service → **Variables** → copy **`DATABASE_PUBLIC_URL`**.
2. On your computer:
   ```bash
   cd ~/spin/spin/apps/api
   DATABASE_URL='<DATABASE_PUBLIC_URL>' \
   SEED_ADMIN_PHONE='+251941167843' \
   SEED_ADMIN_PASSWORD='<your strong admin password>' \
   SEED_ADMIN_NAME='Platform Admin' \
   pnpm seed
   ```
   You should see `Admin created`, `Room templates created` and `Placeholder receiving accounts created`.

The API already created the tables when it started (`prisma migrate deploy` in the start command), so the seed can run straight away.

---

## 4. Vercel: deploy the web app

1. Vercel dashboard → **Add New… → Project** → import `yohannesalex/spin`.
2. On the configuration screen:

   | Setting | Value |
   |---|---|
   | Framework Preset | Next.js (detected automatically) |
   | Root Directory | **`apps/web`**. Click **Edit** and select it. |
   | Build / Install / Output | leave the defaults (Vercel detects pnpm from the root lockfile) |

3. **Environment Variables**: add both, for all environments:

   | Name | Value |
   |---|---|
   | `API_URL` | `https://<your API URL>` (no trailing slash) |
   | `NEXT_PUBLIC_WS_URL` | `https://<your API URL>` |

4. Click **Deploy**. When it finishes you get an address like `https://spin-yohannesalex.vercel.app`. This is your **web URL**.

Both variables are read when the app is built. If you change either of them later, go to **Deployments → ⋯ → Redeploy** for the change to take effect.

---

## 5. Connect the two

1. Back in Railway → **api** service → **Variables**: set `WEB_ORIGIN` to your exact web URL, with no trailing slash:
   ```env
   WEB_ORIGIN=https://spin-yohannesalex.vercel.app
   ```
   To allow more than one address (for example a custom domain as well), separate them with commas, no spaces.
2. Railway redeploys automatically. Wait until the deployment is **Active**.

Why this matters: the API rejects any change request (login, deposit, join) that comes from an address not listed in `WEB_ORIGIN`. Vercel *preview* deployments use different addresses, so they won't be able to log in. Test on the production URL.

---

## 6. Check that it works

On your web URL:

1. **Player:** Sign up → enter code `0000` → Deposit → type `100` → **Simulate payment** → the wallet shows 100 birr.
2. **Game:** register a second player in a private/incognito window, simulate a payment there too, and have both join **Duel 20**. The wheel spins on both screens and the winner gets 32 birr.
3. **Admin:** `https://<web URL>/admin/login` → `0941167843` + your strong password → code `0000`.
4. **Admin setup for this new database:**
   - **Settings → Receiving accounts:** enter your real accounts again. The seed only created placeholders. Last known values:
     - Telebirr `+251941167843`, name `Carmel Zerihun Desalegn`
     - CBE `1000474528905`, name `Yohannes Alemayehu Abdi`
   - **Games → Create game type:** recreate the 20-birr 2-, 3- and 5-player rooms (and any others you want).

---

## 7. Updating the app

Push to the `main` branch on GitHub. Vercel rebuilds the web app, and Railway rebuilds the API (only when files in `apps/api/` change) and applies any new database migrations on start.

---

## 8. Before real launch (real money)

**While the testing flags are on, keep the URL private.** With `OTP_FIXED_CODE=0000`, anyone can register any phone number, and admin 2FA is just `0000`, so the admin password is the only protection. With `DEPOSIT_SIMULATION=true`, anyone can give themselves money.

When you're ready for real money:

1. In Railway variables, **delete `OTP_FIXED_CODE` and `DEPOSIT_SIMULATION`**, and set `NODE_ENV=production`.
2. **SMS:** set `SMS_PROVIDER=afromessage` and add `AFROMESSAGE_TOKEN`, `AFROMESSAGE_IDENTIFIER_ID` and `AFROMESSAGE_SENDER_ID`.
3. **Receipt checks from Ethiopia.** Railway's servers are outside Ethiopia, and Telebirr's receipt site blocks or times out foreign IPs, so Telebirr deposits would all end up as "Provider unavailable". Either:
   - run a small relay on an Ethiopian VPS and set `RECEIPT_RELAY_URL`, or
   - host the API itself on an Ethiopian VPS instead of Railway (same build and start commands).
4. **Receiving accounts:** check the names in Admin → Settings match the receipts exactly.
5. **Plans:**
   - Vercel's free Hobby plan is for non-commercial use only, so a real-money platform needs **Vercel Pro**.
   - Railway charges for usage after its trial.
   - Check both providers' current pricing.
6. **Backups:** turn on backups for the Railway Postgres service, and test restoring one (REQ-SEC-07).
7. **Optional:**
   - `TURNSTILE_SECRET` adds bot protection on sign-up.
   - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` send admin alerts to Telegram.
   - Add a custom domain in Vercel, then add it to `WEB_ORIGIN`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Railway build fails at `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` is out of date. Run `pnpm install` locally, commit the lockfile, and push. |
| API crashes with `must not be set in production` | A testing flag is on while `NODE_ENV=production`. Set `NODE_ENV=staging`, or remove the flags. |
| API logs show Redis `ENOTFOUND` / connection errors | Check that `REDIS_URL` ends with `?family=0` and that the Redis service is running. |
| Login or deposit fails with **Bad origin** / **Missing CSRF header** | `WEB_ORIGIN` doesn't exactly match the address in your browser (check `https://` and remove any trailing `/`). Remember previews use different addresses. |
| Pages load but say "Not logged in" right after login | `COOKIE_SECURE=true` requires https. Use the `https://…vercel.app` address. |
| Lobby doesn't update live / wheel doesn't spin for others | `NEXT_PUBLIC_WS_URL` is wrong or was changed without a redeploy. Fix it, then redeploy on Vercel. |
| Every user hits "Too many attempts" at the same time | `TRUST_PROXY` isn't `2` while traffic goes through Vercel. |
