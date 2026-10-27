# Tidewater: incident war-room

```
client/   React + Vite + Zustand + Yjs + Socket.IO client
server/   Express, Socket.IO (+Redis adapter), MongoDB, BullMQ, Yjs, JWT
docker-compose.yml
```

## Run it (development)

Needs Node 18+ and Docker (for MongoDB and Redis).

```bash
# 1. databases
docker compose up -d mongo redis

# 2. API on :4000   (.env is already copied from .env.example)
cd server
npm install
npm run dev

# 3. app on :5173   (new terminal)
cd client
npm install
npm run dev
```

Open http://localhost:5173. On the first boot the server seeds a demo team, three webhook
integrations and two resolved incidents. All demo accounts share the password `tidewater`.

To be two people at once, use a normal window and a private window (the refresh cookie is
shared by all tabs of one browser, so two tabs are the same person).

Everything in containers instead: `docker compose --profile full up --build`, then http://localhost:8080.

## What happens when you declare an incident

1. Browser sends `incident:declare` over the socket.
2. Server checks the permission, picks the on-call primary as commander and the secondary as
   scribe, finds a comms person, and writes events: created, three role assignments, first page.
3. Each event is saved (unique id, so retries are safe), the incident read model is rebuilt,
   and the event is broadcast to every connected client through the Redis adapter.
4. The page event queues an email/SMS job and a delayed BullMQ job for level 2.
5. If nobody acknowledges before the timer fires, level 2 is paged, then level 3.
   Acknowledging or resolving cancels the timers.

## Backend map

| Piece | File |
|---|---|
| Append-only log, projection, broadcast, side effects | `server/src/services/eventService.js`, `projector.js` |
| Event rules and per-event permission checks | `server/src/services/eventAuth.js`, `domain/rbac.js` |
| Escalation timers (BullMQ delayed jobs, survive restarts) | `server/src/services/escalation.js` |
| Email and SMS with retries | `server/src/services/notify.js`, `providers.js` |
| Collaborative runbook (Yjs) + Redis relay between servers | `server/src/services/yjsService.js`, `socket.js` |
| Webhook parsing and dedupe (Prometheus, Datadog, custom) | `server/src/domain/normalize.js`, `webhookService.js` |
| JWT access + rotating refresh cookie, reuse detection | `server/src/routes/auth.js` |
| Public status page API and subscribers | `server/src/routes/public.js`, `statusService.js` |

## Configuration worth knowing

- `ESC_SECONDS=20,40,60,90` are demo timers. For real use try `300,600,900,1800`.
- Email prints to the server console until you set `SMTP_*`. SMS prints until you set `TWILIO_*`.
- Add your phone number on the On-call page to receive the SMS.
- Before production: set a real `JWT_ACCESS_SECRET`, `SEED_DEMO=false`, `COOKIE_SECURE=true`,
  and `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the first admin.

## Tests

```bash
cd server && npm test     # event folding, permissions, rotation, webhook parsing
```

## Deploy (Render + MongoDB Atlas)

The root `Dockerfile` builds the React app and serves it from the Node server, so the whole
product is one web service. `render.yaml` describes it plus a Redis-compatible Key Value store.

1. Create a free MongoDB Atlas cluster, a database user, and allow network access from anywhere
   (0.0.0.0/0). Copy the `mongodb+srv://...` connection string and add a database name, e.g. `/warroom`.
2. Push this repo to GitHub.
3. In Render: New, Blueprint, pick the repo, and paste the Atlas string as `MONGO_URI` when asked.
4. When it is live, open `https://<your-service>.onrender.com/api/health`.

On the free plan the service sleeps after 15 idle minutes, and escalation timers do not run while
it sleeps. A paid instance avoids that.
