# Tidewater: incident war-room

Tidewater is a real-time incident response tool. When something breaks in production, it puts the
right people into one shared room, gives each of them a clear role, pages the next person
automatically if nobody responds, keeps an append-only record of everything that happened, and
publishes customer-facing updates on a public status page.

**Live demo:** `https://YOUR-SERVICE.onrender.com` (replace with your Render URL)

> The demo runs on Render's free plan, which sleeps after 15 idle minutes. The first request
> after a break can take 30 to 60 seconds. Escalation timers do not run while the service sleeps.

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Quick start (local development)](#quick-start-local-development)
5. [Demo accounts](#demo-accounts)
6. [Configuration](#configuration)
7. [How it works](#how-it-works)
8. [Roles and permissions](#roles-and-permissions)
9. [API overview](#api-overview)
10. [Webhook integrations](#webhook-integrations)
11. [Testing](#testing)
12. [Deployment (Render + MongoDB Atlas)](#deployment-render--mongodb-atlas)
13. [Troubleshooting](#troubleshooting)
14. [Production checklist](#production-checklist)

---

## Features

- **Incident declaration.** Choose a service and a severity (SEV 1 to SEV 4). The server assigns a
  commander, a scribe and a communications lead from the on-call schedule.
- **Live shared room.** Messages, actions, decisions, severity and status changes appear instantly
  for everyone in the incident (Socket.IO with a Redis adapter, so it works across several servers).
- **Automatic escalation.** If nobody acknowledges a page before the timer fires, the next on-call
  level is paged. Timers are BullMQ delayed jobs, so they survive server restarts. Acknowledging or
  resolving cancels them.
- **Append-only event log.** Every change is stored as an immutable event. The current state of an
  incident is rebuilt from its events, which gives a complete timeline and makes retries safe.
- **Collaborative runbook.** A shared document that several responders can edit at once (Yjs).
- **Postmortem.** Each resolved incident has a postmortem panel that can be drafted from its timeline.
- **Public status page.** A login-free page at `/status` showing current service health and
  customer-facing updates, with email subscriptions.
- **Inbound webhooks.** Prometheus, Datadog and a generic custom source can open incidents
  automatically. Duplicate alerts are merged.
- **On-call management.** View the rotation, add team members, and set phone numbers for SMS.
- **Notifications.** Email (SMTP) and SMS (Twilio) with retries. Without credentials they are
  printed to the server log, so everything works in development.
- **Security basics.** JWT access tokens, rotating refresh cookies with reuse detection, role-based
  permissions enforced on the server, rate limiting, Helmet headers, and input validation with Zod.

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 18, Vite, React Router, Zustand, Socket.IO client, Yjs, lucide-react |
| Server | Node.js 20, Express, Socket.IO, Zod, Helmet, express-rate-limit |
| Database | MongoDB (Mongoose) |
| Queue and pub/sub | Redis-compatible store (ioredis, BullMQ, Socket.IO Redis adapter) |
| Auth | JSON Web Tokens, bcrypt, rotating refresh cookie |
| Notifications | Nodemailer (SMTP), Twilio (SMS) |
| Delivery | Docker, Render Blueprint, GitHub Actions CI |

## Project structure

```
.
├── client/                 React + Vite single-page app
│   └── src/
│       ├── pages/          Login, Dashboard, IncidentRoom, OnCall, Integrations, StatusPage
│       ├── components/     Shared UI pieces
│       ├── store/          Zustand state
│       └── lib/            API and socket helpers
├── server/
│   └── src/
│       ├── index.js        Entry point
│       ├── app.js          Express app, health check, static files
│       ├── config.js       Environment variables
│       ├── socket.js       Socket.IO, Yjs relay, rate limits
│       ├── routes/         auth, users, incidents, integrations, webhooks, public, config
│       ├── services/       eventService, projector, escalation, notify, yjsService, seed, ...
│       ├── domain/         fold, rbac, normalize, oncall, runbook, constants
│       ├── models/         Mongoose models
│       └── middleware/     auth and error handling
├── Dockerfile              Builds the client and serves it from the Node server
├── docker-compose.yml      Local MongoDB and Redis (and optionally the full stack)
├── render.yaml             Render Blueprint (web service + Redis-compatible store)
└── .github/workflows/ci.yml  Runs server tests and the client build on every push
```

## Quick start (local development)

**Requirements:** Node.js 18 or newer, and Docker (for MongoDB and Redis).

```bash
# 1. Start the databases
docker compose up -d mongo redis

# 2. Start the API on http://localhost:4000
cd server
cp .env.example .env      # skip if .env already exists
npm install
npm run dev

# 3. Start the client on http://localhost:5173 (in a new terminal)
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. On the first start the server seeds a demo team, three webhook
integrations and two resolved incidents.

**Everything in containers instead:**

```bash
docker compose --profile full up --build
```

Then open <http://localhost:8080>.

**Acting as two people at once.** The refresh cookie is shared by all tabs of one browser, so two
tabs are the same person. Use a normal window and a private/incognito window to log in as two users.

## Demo accounts

All demo accounts use the password **`tidewater`**.

| Email | Name | Role |
|---|---|---|
| `maya@tidewater.dev` | Maya Okafor | admin |
| `arjun@tidewater.dev` | Arjun Mehta | responder |
| `lena@tidewater.dev` | Lena Fischer | responder |
| `tomas@tidewater.dev` | Tomas Rivera | responder (comms) |
| `priya@tidewater.dev` | Priya Nair | responder (scribe) |
| `sam@tidewater.dev` | Sam Whitaker | viewer (read-only) |

There is no public sign-up page, because the app is meant for a private team. An admin adds people
from the **On-call** page (name, email, title, role). The app then shows a temporary password to
give to the new user.

## Configuration

Configuration is read from environment variables. For local development copy
`server/.env.example` to `server/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` serves the built client |
| `PORT` | `4000` | HTTP port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/warroom` | MongoDB connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |
| `JWT_ACCESS_SECRET` | dev value | Secret used to sign access tokens. **Change in production.** |
| `ACCESS_TTL_MIN` | `15` | Access token lifetime in minutes |
| `REFRESH_TTL_DAYS` | `14` | Refresh token lifetime in days |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin (CORS) |
| `APP_URL` | `http://localhost:5173` | Public URL used in notification links |
| `API_PUBLIC_URL` | `http://localhost:4000` | Public API URL shown for webhooks |
| `ESC_SECONDS` | `20,40,60,90` | Seconds before escalating, for SEV 1, 2, 3 and 4 |
| `SEED_DEMO` | `true` | Create demo users and incidents on first start |
| `DEMO_PASSWORD` | `tidewater` | Password for demo accounts |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | empty | First admin when `SEED_DEMO=false` and there are no users |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | empty | Email delivery. Empty host logs emails to the console. |
| `MAIL_FROM` | `Tidewater <alerts@tidewater.dev>` | Sender address |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | empty | SMS delivery. Empty values log texts to the console. |

The escalation timers are deliberately short for demos. For real use, try `300,600,900,1800`
(5, 10, 15 and 30 minutes).

## How it works

### Declaring an incident

1. The browser sends `incident:declare` over the socket.
2. The server checks the user's permission, picks the primary on-call person as commander and the
   secondary as scribe, and finds a communications lead.
3. It writes events: created, three role assignments, and the first page.
4. Each event is saved with a unique id (so retries are safe), the incident's read model is rebuilt,
   and the event is broadcast to every connected client through the Redis adapter.
5. The page event queues an email/SMS job and a delayed BullMQ job for the next escalation level.
6. If nobody acknowledges before the timer fires, level 2 is paged, then level 3. Acknowledging or
   resolving cancels the timers.

### Event sourcing in short

Incidents are not edited in place. Every message, action, decision, status change and page is an
immutable event appended to a log. The current incident view (the "projection") is computed by
folding those events. This gives a trustworthy timeline for postmortems and makes it safe to retry
a request without duplicating anything.

### Backend map

| Responsibility | File |
|---|---|
| Append-only log, projection, broadcast, side effects | `server/src/services/eventService.js`, `projector.js` |
| Event rules and per-event permission checks | `server/src/services/eventAuth.js`, `server/src/domain/rbac.js` |
| Escalation timers (BullMQ delayed jobs) | `server/src/services/escalation.js` |
| Email and SMS with retries | `server/src/services/notify.js`, `providers.js` |
| Collaborative runbook (Yjs) and Redis relay | `server/src/services/yjsService.js`, `server/src/socket.js` |
| Webhook parsing and de-duplication | `server/src/domain/normalize.js`, `server/src/services/webhookService.js` |
| JWT access token and rotating refresh cookie | `server/src/routes/auth.js` |
| Public status page and subscribers | `server/src/routes/public.js`, `server/src/services/statusService.js` |

## Roles and permissions

Permissions are enforced on the server. The client only hides buttons.

**Account roles**

| Role | Can do |
|---|---|
| `admin` | Everything, including adding users and managing integrations |
| `responder` | Declare incidents, post messages, log actions, edit the runbook, acknowledge pages |
| `viewer` | Read only |

**Incident roles** (assigned per incident, on top of the account role)

| Role | Extra abilities in that incident |
|---|---|
| `commander` | Log decisions, change severity and status, assign roles, page people, publish status updates |
| `scribe` | Log actions and decisions, edit the runbook |
| `comms` | Post messages and publish customer-facing status updates |

## API overview

Most real-time actions go over the socket (`incident:declare`, `event:append`, `yjs:*`). The REST
API handles authentication, reading data and administration.

| Method and path | Auth | Description |
|---|---|---|
| `GET /api/health` | none | Returns `{"ok":true,"mongo":true,"redis":true,"uptime":...}` |
| `GET /api/config` | none | Public client configuration |
| `POST /api/auth/login` | none | Log in with email and password |
| `POST /api/auth/refresh` | cookie | Rotate the refresh token and get a new access token |
| `POST /api/auth/logout` | cookie | Log out |
| `GET /api/auth/me` | user | Current user |
| `PATCH /api/auth/me` | user | Update name or phone number |
| `POST /api/auth/password` | user | Change password (minimum 10 characters) |
| `GET /api/users` | user | List team members |
| `POST /api/users` | admin | Add a team member (returns a temporary password) |
| `PATCH /api/users/:uid` | admin | Update a team member |
| `GET /api/incidents` | user | List incidents |
| `GET /api/incidents/:id` | user | One incident |
| `GET /api/incidents/:id/notifications` | user | Notification history |
| `GET`, `PUT`, `DELETE /api/incidents/:id/postmortem` | user | Read, save or remove the postmortem |
| `GET /api/events` | user | Event log |
| `GET /api/integrations` | user | List webhook integrations |
| `POST`, `PATCH`, `DELETE /api/integrations` | admin | Manage integrations |
| `POST /api/webhooks/:source/:token` | token | Receive an alert |
| `GET /api/public/status` | none | Status page data |
| `POST /api/public/subscribe` | none | Subscribe to status emails |

## Webhook integrations

Open the **Integrations** page to see each integration's URL and secret token. Point your monitoring
tool at:

```
POST https://YOUR-SERVICE.onrender.com/api/webhooks/<source>/<token>
```

`<source>` is one of the supported sources (Prometheus Alertmanager, Datadog, or custom). Alerts
are normalised into a common shape, mapped to a service and severity, and duplicates of an open
incident are merged instead of creating a new one. The page also shows recent deliveries, so you
can see what was received.

## Testing

```bash
cd server
npm test
```

The tests use Node's built-in test runner and cover event folding, permission checks, refresh-token
rotation and webhook parsing. GitHub Actions (`.github/workflows/ci.yml`) runs the server tests and
the client build on every push and pull request.

## Deployment (Render + MongoDB Atlas)

The root `Dockerfile` builds the React app and serves it from the Node server, so the whole product
is one web service. `render.yaml` describes that service plus a Redis-compatible Key Value store.
MongoDB comes from MongoDB Atlas.

1. **MongoDB Atlas.**
   - Create a free (M0) cluster.
   - Under **Database Access**, add a user with a password made of letters and numbers only.
   - Under **Network Access**, add `0.0.0.0/0` (Render's free tier has no fixed IP address).
   - Under **Connect > Drivers**, copy the `mongodb+srv://...` string. Replace `<password>`, and add
     the database name `warroom` between `.net/` and `?`:

     ```
     mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/warroom?retryWrites=true&w=majority
     ```

   - Optional check: `mongosh "<your string>"` should open a prompt.
2. **GitHub.** Push this repository to GitHub.
3. **Render.** Choose **New > Blueprint**, select the repository, give the Blueprint a name, and paste
   the Atlas string when it asks for `MONGO_URI`. Click **Deploy Blueprint**.
4. **Verify.** When the web service shows **Deployed**, open
   `https://YOUR-SERVICE.onrender.com/api/health`. You should see `"mongo":true,"redis":true`.
   Then open the site and log in with a [demo account](#demo-accounts).

Later changes deploy automatically: commit and `git push`, and Render rebuilds.

> If the repository does not appear in Render, open the GitHub permissions page for the Render app
> and grant access to this repository (or temporarily make it public).

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `bad auth : authentication failed` from `mongosh` or in the logs | Wrong database password. Check for look-alike characters (`0` and `O`) or set a new password in Atlas. |
| Connection times out to Atlas | Network Access is missing `0.0.0.0/0` or is not yet **Active**. |
| `/api/health` shows `"mongo":false` | `MONGO_URI` is wrong or Atlas is unreachable. Check the service logs. |
| `/api/health` shows `"redis":false` | The Redis store is not running or `REDIS_URL` is not linked. |
| `/api/health` shows the login page | The URL is not exactly `/api/health` (any other path falls through to the app). |
| First page load is very slow | Free plan wake-up. Wait and refresh once. |
| Escalation never fires | The service was asleep. Timers do not run while it sleeps. |
| Two browser tabs behave as one person | They share a refresh cookie. Use a private window for the second user. |
| Emails or SMS never arrive | Without `SMTP_*` or `TWILIO_*` they are only printed in the logs. |

## Production checklist

- [X] Set a long random `JWT_ACCESS_SECRET` (Render's Blueprint generates one automatically).
- [X] Set `SEED_DEMO=false`, and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first admin.
- [X] Set `COOKIE_SECURE=true` and serve over HTTPS.
- [X] Use real escalation timers, for example `ESC_SECONDS=300,600,900,1800`.
- [X] Configure `SMTP_*` and `TWILIO_*` so pages actually reach people.
- [X] Restrict MongoDB Network Access to known addresses where possible, and use a database user
      limited to the `warroom` database.
- [X] Use a paid Render instance so the service does not sleep and timers keep running.
- [X] Never commit `.env` files. They are already listed in `.gitignore`.



