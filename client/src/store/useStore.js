import { create } from 'zustand';
import { api, onAuthLost, refreshSession, setAccessToken } from '../lib/api.js';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket.js';
import { applyConfig, setTeam } from '../lib/constants.js';
import { uid } from '../lib/ids.js';

const seen = new Set();
let restoring = null;

export const useStore = create((set, get) => ({
  events: [],
  lastTs: 0,
  me: null,
  team: [],
  config: null,
  booted: false,
  ready: false,
  connected: false,
  toasts: [],

  // ----- session -----
  // Runs once even if React StrictMode mounts the app twice in development.
  restoreSession() {
    if (!restoring) {
      restoring = (async () => {
        try {
          const r = await refreshSession();
          if (r) {
            set({ me: r.user });
            await get().bootstrap();
          }
        } catch {
          /* server unreachable: fall through to the sign-in screen */
        } finally {
          set({ booted: true });
        }
      })();
    }
    return restoring;
  },

  async login(email, password) {
    const r = await api.post('/auth/login', { email, password }, { auth: false });
    setAccessToken(r.accessToken);
    set({ me: r.user });
    try {
      await get().bootstrap();
    } catch (e) {
      await get().logout();
      throw e;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout', {}, { auth: false });
    } catch {
      /* already gone */
    }
    disconnectSocket();
    setAccessToken(null);
    seen.clear();
    restoring = null;
    set({ me: null, events: [], lastTs: 0, ready: false, connected: false, booted: true });
  },

  // ----- data -----
  async bootstrap() {
    const [config, users] = await Promise.all([api.get('/config', { auth: false }), api.get('/users')]);
    applyConfig(config);
    setTeam(users.users);
    seen.clear();
    set({ config, team: users.users, events: [], lastTs: 0 });
    await get().loadEvents();
    connectSocket({
      onConnect: () => {
        set({ connected: true });
        // Always catch up on connect. This also covers anything that happened between the
        // first bulk load and the socket coming up.
        get().loadEvents(Math.max(0, get().lastTs - 120000)).catch(() => {});
      },
      onDisconnect: () => set({ connected: false }),
      onEvent: (e) => get().receive([e]),
      onTeam: () => get().refreshTeam(),
      onAuthLost: () => get().logout(),
    });
    set({ ready: true, connected: !!getSocket()?.connected });
  },

  // First load pages through everything by cursor. A `since` timestamp is a catch-up after a
  // dropped connection; duplicates are harmless because events are deduplicated by id.
  async loadEvents(since) {
    let after = null;
    for (let i = 0; i < 100; i++) {
      const qs = since != null ? `?since=${since}` : after ? `?after=${after}` : '';
      const r = await api.get(`/events${qs}`);
      get().receive(r.events);
      if (since != null || !r.more) break;
      after = r.cursor;
    }
  },

  receive(list) {
    const fresh = list.filter((e) => !seen.has(e.id));
    if (!fresh.length) return;
    let lastTs = get().lastTs;
    for (const e of fresh) {
      seen.add(e.id);
      if (e.ts > lastTs) lastTs = e.ts;
    }
    set({ events: [...get().events, ...fresh], lastTs });
  },

  async refreshTeam() {
    try {
      const { users } = await api.get('/users');
      setTeam(users);
      const me = users.find((u) => u.id === get().me?.id);
      set({ team: users, me: me || get().me });
    } catch {
      /* keep the old list */
    }
  },

  // ----- commands over the socket -----
  emit(event, data) {
    return new Promise((resolve, reject) => {
      const s = getSocket();
      if (!s || !s.connected) {
        get().toast('info', 'You are offline', 'Reconnecting. Try again in a moment.');
        return reject(new Error('offline'));
      }
      s.timeout(8000).emit(event, data, (err, res) => {
        if (err) {
          get().toast('info', 'The server did not answer', 'Check your connection and try again.');
          return reject(err);
        }
        if (!res?.ok) {
          get().toast('info', 'That did not go through', res?.error || 'The server rejected the request.');
          return reject(new Error(res?.error || 'rejected'));
        }
        resolve(res);
      });
    });
  },

  // The id is generated here so a retry after a timeout cannot create a duplicate.
  send: (partial) => get().emit('event:append', { id: uid(), ...partial }),
  async declare(input) {
    const r = await get().emit('incident:declare', input);
    return r.id;
  },

  // ----- toasts -----
  toast(kind, title, body) {
    const id = uid();
    set({ toasts: [...get().toasts, { id, kind, title, body }] });
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

onAuthLost(() => {
  if (useStore.getState().me) useStore.getState().logout();
});
