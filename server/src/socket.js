import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { Incident, User } from './models/index.js';
import { config } from './config.js';
import { makeRedis } from './redis.js';
import { setIo } from './services/socketHub.js';
import { appendClientEvent } from './services/eventAuth.js';
import { declareIncident } from './services/incidentService.js';
import { applyClientUpdate, fullState } from './services/yjsService.js';
import { verifyAccess } from './middleware/auth.js';
import { errMessage } from './middleware/errors.js';
import { can } from './domain/rbac.js';
import { SERVICE_IDS, SEVERITY_IDS } from './domain/constants.js';
import { httpError } from './utils.js';
import { log } from './logger.js';

const declareSchema = z.object({
  title: z.string().trim().min(4, 'Give the incident a title of at least 4 characters.').max(120),
  severity: z.enum(SEVERITY_IDS),
  service: z.enum(SERVICE_IDS),
  summary: z.string().trim().max(2000).default(''),
});

// Sliding-window limiter, one per socket per message family.
function limiter(max, windowMs) {
  let n = 0;
  let start = Date.now();
  return () => {
    const now = Date.now();
    if (now - start > windowMs) {
      start = now;
      n = 0;
    }
    return ++n <= max;
  };
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 2e6,
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  // Redis adapter: broadcasts reach sockets connected to any server instance.
  const pub = makeRedis();
  const sub = pub.duplicate();
  sub.on('error', (e) => log.error('redis sub:', e.message));
  io.adapter(createAdapter(pub, sub));
  setIo(io);

  // Public namespace for the status page: no auth, receives "something changed" pings only.
  io.of('/public').on('connection', () => {});

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccess(token);
      const user = await User.findOne({ uid: payload.sub }).lean();
      if (!user || user.disabled) return next(new Error('unauthorized'));
      socket.data.user = { id: user.uid, name: user.name, hue: user.hue };
      socket.data.perm = new Map();
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const me = socket.data.user;
    socket.join('team');
    socket.join(`user:${me.id}`);

    const eventLimit = limiter(60, 10000);
    const yjsLimit = limiter(900, 10000);

    const handle = (limit, fn) => async (arg, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!limit()) return reply({ ok: false, error: 'You are sending too fast. Wait a moment.' });
      try {
        reply({ ok: true, ...(await fn(arg)) });
      } catch (err) {
        reply({ ok: false, error: errMessage(err) });
      }
    };

    // Re-reads the user, so role changes and disabled accounts apply to live sockets too.
    const currentUser = async () => {
      const u = await User.findOne({ uid: me.id });
      if (!u || u.disabled) throw httpError(401, 'This account is unavailable.');
      return u;
    };

    socket.on('event:append', handle(eventLimit, async (input) => {
      const evt = await appendClientEvent(await currentUser(), input);
      return { event: evt, duplicate: !evt };
    }));

    socket.on('incident:declare', handle(eventLimit, async (input) => {
      const u = await currentUser();
      if (!can({ id: u.uid, role: u.role }, null, 'declare')) throw httpError(403, 'You do not have permission to declare incidents.');
      const data = declareSchema.parse(input);
      const id = await declareIncident({ ...data, actor: u.uid });
      return { id };
    }));

    // ----- Runbook (Yjs) sync -----
    const room = (id) => `rb:${id}`;
    const canEdit = async (incidentId) => {
      const cached = socket.data.perm.get(incidentId);
      if (cached && Date.now() - cached.at < 15000) return cached;
      const [u, inc] = await Promise.all([User.findOne({ uid: me.id }).lean(), Incident.findById(incidentId).lean()]);
      const v = { at: Date.now(), exists: !!inc, canEdit: !!u && !u.disabled && !!inc && can({ id: u.uid, role: u.role }, inc, 'edit_runbook') };
      socket.data.perm.set(incidentId, v);
      return v;
    };

    socket.on('yjs:join', handle(eventLimit, async ({ incidentId } = {}) => {
      const perms = await canEdit(String(incidentId));
      if (!perms.exists) throw httpError(404, 'Incident not found.');
      await socket.join(room(incidentId));
      return { state: await fullState(incidentId), canEdit: perms.canEdit };
    }));

    socket.on('yjs:update', async ({ incidentId, update } = {}) => {
      if (!yjsLimit()) return;
      try {
        const perms = await canEdit(String(incidentId));
        if (!perms.canEdit || !update) return;
        await applyClientUpdate(incidentId, update);
        socket.to(room(incidentId)).emit('yjs:update', { incidentId, update });
      } catch (err) {
        log.warn('yjs update rejected:', err.message);
      }
    });

    socket.on('rb:presence', ({ incidentId } = {}) => {
      if (!socket.rooms.has(room(incidentId))) return;
      socket.to(room(incidentId)).emit('rb:presence', { incidentId, sid: socket.id, user: me });
    });

    socket.on('yjs:leave', ({ incidentId } = {}) => {
      socket.leave(room(incidentId));
      socket.to(room(incidentId)).emit('rb:bye', { incidentId, sid: socket.id });
    });

    socket.on('disconnecting', () => {
      for (const r of socket.rooms) if (r.startsWith('rb:')) socket.to(r).emit('rb:bye', { incidentId: r.slice(3), sid: socket.id });
    });
  });

  return io;
}
