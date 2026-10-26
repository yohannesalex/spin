# Deploying Spin Draw on a free Oracle Cloud server

Everything runs on one server, using the files in `deploy/`:

```
Internet ──https──▶ Caddy (ports 80/443, free automatic HTTPS)
                     ├─ /api/*, /socket.io/*  ──▶ api   (NestJS)
                     └─ everything else        ──▶ web   (Next.js)
                     api ──▶ postgres, redis   (private, not reachable from the internet)
```

You don't need Vercel or Railway for this setup. If you made a Vercel project earlier, you can delete it.

You'll need, in total:
- an Oracle Cloud account (free, but asks for a card to verify you);
- a free domain from DuckDNS;
- about an hour.

---

## 0. On your computer: push the deployment files

```bash
cd ~/spin/spin
git add -A
git commit -m "Add production deployment (Docker + Caddy)"
git push
```

---

## 1. Create the Oracle Cloud account

1. Go to https://www.oracle.com/cloud/free/ → **Start for free**.
2. Fill in your details. **Pick your Home Region carefully: it can't be changed later, and free servers can only be created there.**
   - Closest to Ethiopia: **Saudi Arabia West (Jeddah)**, **UAE East (Dubai)** or **UAE Central (Abu Dhabi)**.
   - If a region keeps reporting *Out of capacity* in step 2, a less busy one (e.g. Frankfurt, Marseille, Johannesburg) usually works. It just means a bit more delay to Ethiopia.
3. Verify with a card. Oracle may place a small temporary hold. The Always Free resources used below don't cost anything.

---

## 2. Create the server

1. Console → ☰ menu → **Compute → Instances → Create instance**.
2. **Name:** `spin`.
3. **Image and shape → Edit:**
   - **Image → Change image → Ubuntu → Canonical Ubuntu 24.04** (or 22.04).
   - **Shape → Change shape → Ampere → `VM.Standard.A1.Flex`**. Set **OCPUs: 2**, **Memory: 12 GB**. It must say *Always Free-eligible*. Recent reports say the free allowance is 2 OCPU / 12 GB; if your console allows more for free, more is fine.
4. **Networking:** leave **Create new virtual cloud network** and **Create new public subnet** selected, and make sure **Assign a public IPv4 address** is on.
5. **Add SSH keys:** choose **Generate a key pair for me** → **Save private key**. Keep the file, e.g. `~/Downloads/ssh-key-spin.key`. If you already have a key, choose **Paste public key** and paste the output of `cat ~/.ssh/id_ed25519.pub`.
6. **Boot volume:** the default is fine (up to 200 GB is free).
7. Click **Create**. When it shows **Running**, copy its **Public IP address**, e.g. `141.145.1.2`.

**"Out of capacity for shape VM.Standard.A1.Flex"?** Try another *Availability domain* in the same form, or try again later. Free Arm capacity comes and goes.

---

## 3. Open the web ports in Oracle's firewall

Oracle blocks everything except SSH by default.

1. On the instance page, click the **Subnet** link (under *Primary VNIC*) → **Security Lists** → **Default Security List for …** → **Add Ingress Rules**.
2. Add two rules:

   | Source CIDR | IP Protocol | Destination Port Range |
   |---|---|---|
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

3. Click **Add Ingress Rules**.

You'll also open the ports on the server itself in step 6.

---

## 4. Get a free domain (DuckDNS)

HTTPS needs a domain name. Secure login cookies only work over HTTPS.

1. Go to https://www.duckdns.org and log in (with GitHub or Google).
2. Type a name, e.g. `spindraw`, and click **add domain**.
3. In the **current ip** box next to it, **replace the value with your server's public IP** from step 2.7, then click **update ip**. DuckDNS fills in *your laptop's* IP by default, which is wrong.
4. Your domain is now `spindraw.duckdns.org`. Check it on your computer: `ping spindraw.duckdns.org` should show the server's IP.

If you have your own domain, add an **A record** pointing to the server IP instead.

---

## 5. Connect to the server

```bash
chmod 600 ~/Downloads/ssh-key-spin.key
ssh -i ~/Downloads/ssh-key-spin.key ubuntu@<SERVER_IP>
```

Type `yes` the first time. Every command from here on runs **on the server**.

---

## 6. Prepare the server

```bash
# Updates
sudo apt update && sudo apt -y upgrade

# Open ports 80 and 443 in Ubuntu's own firewall (Oracle images block them) and keep the rule after reboots
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j ACCEPT
sudo netfilter-persistent save

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Log out and back in so the docker group applies
exit
```

```bash
ssh -i ~/Downloads/ssh-key-spin.key ubuntu@<SERVER_IP>
docker run --rm hello-world     # should print "Hello from Docker!"
```

---

## 7. Get the code onto the server

The repository `yohannesalex/spin` is probably private, so give the server read-only access with a **deploy key**:

```bash
ssh-keygen -t ed25519 -C "spin-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

1. Copy the printed line.
2. On GitHub: **yohannesalex/spin → Settings → Deploy keys → Add deploy key**. Title: `oracle server`. Paste the key and **leave "Allow write access" off**. Click **Add key**.
3. Back on the server:

```bash
cd ~
git clone git@github.com:yohannesalex/spin.git
cd ~/spin
ls deploy        # Caddyfile  backup.sh  docker-compose.yml  .env.example (hidden)
```

---

## 8. Configure

```bash
cd ~/spin/deploy
cp .env.example .env
openssl rand -hex 32   # run twice: one value for POSTGRES_PASSWORD, one for JWT_ACCESS_SECRET
nano .env
```

Fill in:

| Setting | Value |
|---|---|
| `DOMAIN` | `spindraw.duckdns.org` (your domain, without `https://`) |
| `POSTGRES_PASSWORD` | first random value |
| `JWT_ACCESS_SECRET` | second random value |
| `SEED_ADMIN_PASSWORD` | a strong admin password (12+ characters). **Not** `Admin12345`. |

Leave the testing lines (`NODE_ENV=staging`, `OTP_FIXED_CODE=0000`, `DEPOSIT_SIMULATION=true`) as they are for now. Save with **Ctrl+O**, **Enter**, then exit with **Ctrl+X**.

---

## 9. Start it

```bash
cd ~/spin/deploy
docker compose up -d --build
```

The first build takes about 5–15 minutes. Then:

```bash
docker compose ps                  # all five should be "Up" (postgres/redis "healthy")
docker compose logs api | tail     # "All migrations have been successfully applied" … "API listening on :4000"
docker compose logs caddy | grep -i certificate   # "certificate obtained successfully"
```

Open **https://spindraw.duckdns.org/api/health** in your browser. It should show `{"ok":true,...}` with a valid padlock.

If the certificate fails, it's almost always one of: the domain doesn't point to the server IP (step 4), port 80 or 443 is closed (steps 3 and 6), or `DOMAIN` in `.env` is wrong. Fix it and run `docker compose restart caddy`.

---

## 10. Create the admin account and default games (one time)

```bash
docker compose exec api pnpm seed
```

Expected output: `Admin created: +251941167843`, `Room templates created`, `Placeholder receiving accounts created`.

---

## 11. Check everything works

1. **Player:** open `https://spindraw.duckdns.org` → **Sign up** → code `0000` → **Deposit** → amount `100` → **Simulate payment**. The wallet shows 100 birr.
2. **Game:** in an incognito window, sign up a second player and simulate a payment there too. Both join a 2-player room. The wheel spins on both screens and the winner gets the prize.
3. **Admin:** `https://spindraw.duckdns.org/admin/login` → `0941167843` + your `SEED_ADMIN_PASSWORD` → code `0000`.
4. **Admin setup for this new database:**
   - **Settings → Receiving accounts:** replace the placeholders with your real accounts. Last known values:
     - Telebirr `+251941167843`, name `Carmel Zerihun Desalegn`
     - CBE `1000474528905`, name `Yohannes Alemayehu Abdi`
   - **Games → Create game type:** create the rooms you want (e.g. 20 birr with 2, 3 and 5 players), and deactivate any default ones you don't want.

---

## 12. Daily backups

```bash
crontab -e      # choose nano if asked, then add this line at the bottom:
0 3 * * * /home/ubuntu/spin/deploy/backup.sh >> /home/ubuntu/spin/deploy/backups.log 2>&1
```

This makes a compressed database dump every night at 03:00 in `~/spin/deploy/backups/` and keeps 30 days. Run `./backup.sh` once by hand to check it works.

Copy backups off the server now and then. They're lost if the server is deleted. On your computer:

```bash
scp -i ~/Downloads/ssh-key-spin.key 'ubuntu@<SERVER_IP>:spin/deploy/backups/*.gz' ~/spin-backups/
```

**Restoring** into an empty database:

```bash
gunzip -c backups/spin-2026-10-25.sql.gz | docker compose exec -T postgres psql -U spin spin
```

---

## 13. Keep the free server from being reclaimed

Oracle may **reclaim Always Free servers that stay idle** (very low CPU, network and memory use for 7 days). A test app with little traffic can look idle. To avoid it:

- **Recommended:** upgrade the account to **Pay As You Go** (Billing → Upgrade). Always Free resources stay free and aren't reclaimed for being idle.
- Also create a **budget alert**: Billing → Budgets → e.g. 1 USD. Then you're warned if anything ever starts costing money.

---

## 14. Everyday operations

```bash
cd ~/spin/deploy

# Deploy a new version after `git push` from your computer
git pull && docker compose up -d --build

# Logs
docker compose logs -f api          # Ctrl+C to stop watching
docker compose logs --tail 100 caddy

# Restart one service / everything
docker compose restart api
docker compose restart

# After changing .env
docker compose up -d                # recreates containers with the new settings

# Disk space: remove old images now and then
docker image prune -f
```

Database migrations run automatically every time the API starts.

---

## 15. Before real money

**While the testing flags are on, keep the address private.** With `OTP_FIXED_CODE=0000`, anyone can register any phone number, and admin 2FA is just `0000`, so the admin password is the only protection. With `DEPOSIT_SIMULATION=true`, anyone can give themselves money.

When you're ready for real money:

1. In `deploy/.env`: **delete `OTP_FIXED_CODE` and `DEPOSIT_SIMULATION`**, set `NODE_ENV=production`, and run `docker compose up -d`.
2. **SMS:** set `SMS_PROVIDER=afromessage` and add the `AFROMESSAGE_*` keys.
3. **Telebirr receipt checks.** Oracle's regions are all outside Ethiopia, and Telebirr's receipt site blocks or times out foreign IPs. Set `RECEIPT_RELAY_URL` to a small relay running in Ethiopia, or move the whole stack to an Ethiopian VPS. The same `deploy/` files work there. CBE links worked from outside Ethiopia in testing.
4. **Receiving accounts:** check the names in Admin → Settings match your receipts exactly.
5. **Domain:** consider a real domain instead of DuckDNS. Point it at the server, change `DOMAIN`, and run `docker compose up -d`.
6. **Backups:** confirm they run (step 12), and test a restore.
7. **Optional:**
   - `TURNSTILE_SECRET` adds bot protection on sign-up.
   - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` send admin alerts to Telegram.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser can't reach the site at all | Check ports 80/443 in the Security List (step 3) *and* the iptables rule (step 6). Run `curl -I http://localhost` on the server to confirm Caddy answers. |
| Certificate error / "connection not private" | The domain must point to the server IP. Then `docker compose logs caddy` and `docker compose restart caddy`. |
| `docker compose up` says `Set POSTGRES_PASSWORD` / `Set DOMAIN` | Fill them in `deploy/.env` (step 8). |
| Login fails with **Bad origin** | `DOMAIN` must match exactly the address you open in the browser. |
| API keeps restarting with `must not be set in production` | A testing flag is on while `NODE_ENV=production`. Remove the flags or use `NODE_ENV=staging`. |
| Build is killed / runs out of memory | The server is too small. Use the A1.Flex shape with at least 6–12 GB of memory, not the 1 GB "Micro" shape. |
| `git pull` asks for a password | The deploy key isn't set up (step 7). |
