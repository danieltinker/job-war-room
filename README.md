# 🎯 Job War Room

Self-hosted mission control for your job hunt. One dashboard that:

- **Scrapes daily** — LinkedIn job search (guest endpoint, optionally boosted with your own
  `li_at` session cookie) plus the rock-solid public ATS APIs (Greenhouse, Lever, Ashby) of the
  companies you watch.
- **Knows what "relevant" means** — you define *position profiles* (title keywords, tech
  keywords, hard exclusions, locations, remote preference); every scraped job is scored 0–100
  and surfaced as a **suggestion** when it clears your threshold.
- **Stores your resume variants** — backend / fullstack / management versions, linked to
  profiles and applications, encrypted-transport download anytime.
- **Tracks your pipeline** — mark a suggestion "I applied", then move through
  `APPLIED → IN_REVIEW → ASSESSMENT → INTERVIEW → OFFER` (or `REJECTED / WITHDRAWN / GHOSTED`).
- **Reads your inbox so you don't have to** — an IMAP poller classifies application emails
  (received / assessment / interview / offer / rejection), links them to the right application
  by company, and advances statuses automatically (never backwards; a full timeline is kept).
- **Pings you on WhatsApp** — pair your own WhatsApp as a linked device (QR in Settings) and
  get a daily brief, instant match alerts, and status-change notifications.
- **Runs from your phone** — reply in the WhatsApp chat to operate the war room remotely:
  `/jobs` (top suggestions with apply links), `/applied N` (mark applied — attaches the
  matching profile's default resume), `/dismiss N`, `/status`, `/help`.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 14 (App Router) + TypeScript + Tailwind | Single deployable for dashboard + API, server components read the DB directly |
| Database | PostgreSQL 16 + Prisma | Relational pipeline data, migrations checked in |
| Jobs & scheduling | Redis + BullMQ | Durable queues, cron-style repeatable jobs, "run now" from the UI |
| Worker | Node (tsx) long-lived process | Owns scraping, IMAP polling, WhatsApp socket, digests |
| WhatsApp | Baileys (multi-device web protocol) | No browser needed; pairs like WhatsApp Web |
| Email | ImapFlow + mailparser | Works with Gmail app passwords and any IMAP server |
| Auth | Single-user credential login, JWT session cookie (jose), bcrypt | Simple and solid for a personal tool |
| Secrets | AES-256-GCM at rest (`APP_ENCRYPTION_KEY`) | `li_at` cookie & IMAP password never stored in plaintext |

## Quick start (Docker)

```bash
git clone <this repo> && cd job-war-room
cp .env.example .env
# fill in: APP_ENCRYPTION_KEY (openssl rand -hex 32), SESSION_SECRET (openssl rand -hex 32),
#          ADMIN_EMAIL, ADMIN_PASSWORD, optionally POSTGRES_PASSWORD / TZ / APP_URL
docker compose up -d --build
```

Open http://localhost:3000, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (the account is
created on first login), then:

1. **Resumes** → upload your resume variants.
2. **Position profiles** → define what you're hunting (keywords, exclusions, locations, threshold).
3. **Companies** → add your watchlist. For the most reliable scraping set the ATS board token
   (e.g. Greenhouse board `stripe` from `boards.greenhouse.io/stripe`); LinkedIn is swept either way.
4. **Settings** →
   - *WhatsApp*: click **Connect**, scan the QR from WhatsApp → Linked devices, set your target number.
   - *Email tracking*: IMAP host/user/app-password (Gmail: `imap.gmail.com`, port 993).
   - *LinkedIn (optional)*: paste your `li_at` cookie to attach your account session.
   - *Schedules*: daily scrape & digest crons (default 07:00 / 07:30 server time).
5. Hit **⚡ Run sweep now** on the dashboard.

## Local development

```bash
npm install
cp .env.example .env            # point DATABASE_URL/REDIS_URL at local services
npx prisma migrate deploy
npm run dev                     # web on :3000
npm run worker:dev              # worker (scrapers, IMAP, WhatsApp, schedules)
npm test                        # unit tests (matching engine, email classifier)
npm run lint && npm run typecheck
```

## How the pieces talk

```
┌───────────┐   Postgres (data + settings + pairing state)   ┌────────────┐
│  Next.js  │◄──────────────────────────────────────────────►│   Worker   │
│ dashboard │                                                │  (tsx)     │
│  + API    │──── Redis / BullMQ (queues: scrape, email, ───►│ scrapers   │
└───────────┘         digest, whatsapp-control)              │ IMAP poll  │
      ▲                                                      │ Baileys WA │
      │ browser                                              └─────┬──────┘
      ▼                                                            │
   you 🫡                LinkedIn · Greenhouse · Lever · Ashby ◄───┤
                         your IMAP inbox ◄─────────────────────────┤
                         your WhatsApp 📱 ◄────────────────────────┘
```

- The **web app** renders from Postgres and enqueues work; it never scrapes in-request.
- The **worker** runs BullMQ processors + cron schedulers (timezone-aware, editable in
  Settings), maintains the WhatsApp socket, and records every run in **Run history**.
- Statuses advance automatically from email but **only forward** — an offer is never
  downgraded by a late "thanks for applying" email, and everything is auditable in the
  application timeline.

## Security notes

- Single-user system: every page and API route (except login) sits behind the session
  middleware; the login route is rate-limited.
- Secrets (`li_at`, IMAP password) are AES-256-GCM encrypted at rest and never returned by the
  API after being set (masked as "stored").
- Resume files live in Postgres (max 10 MB, PDF/Word/text only) — one volume to back up.
- Run it on your own machine/VPS behind HTTPS (e.g. Caddy/Traefik) if exposed to the internet.

## A word on LinkedIn scraping

The LinkedIn connector uses the public logged-out jobs endpoint, politely throttled (~1 request
/2.5s, capped pages per query) and only for your personal search. Attaching your `li_at` cookie
authenticates requests as you. Note that automated access is against LinkedIn's ToS; keep
volumes personal-scale — the ATS connectors (Greenhouse/Lever/Ashby) are official public APIs
and carry no such caveat, so prefer board tokens for your watchlist where they exist.

## Repository map

```
prisma/              schema + checked-in migrations
src/app/             Next.js pages (dashboard, jobs, applications, companies,
                     profiles, resumes, settings, login) and REST API routes
src/components/      client components (managers, WhatsApp panel, actions)
src/core/            pure logic: matching engine, email classifier, normalizers (unit-tested)
src/scrapers/        linkedin / greenhouse / lever / ashby + sweep orchestrator
src/services/        emailSync (IMAP), whatsapp (Baileys), digest composer
src/lib/             prisma, crypto (AES-GCM), session (jose), settings, queues
worker/              long-lived worker: queue processors + schedulers
tests/               vitest unit tests
Dockerfile           multi-target: web / worker / migrate
docker-compose.yml   postgres + redis + migrate + web + worker
```
