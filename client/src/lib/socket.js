import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api.js';

let socket = null;
export const getSocket = () => socket;

export function connectSocket(h) {
  if (socket) return socket;
  // The auth callback runs on every (re)connect, so a renewed token is always used.
  socket = io({ auth: (cb) => cb({ token: getAccessToken() }), reconnectionDelayMax: 5000 });
  socket.on('connect', h.onConnect);
  socket.on('disconnect', h.onDisconnect);
  socket.on('event', h.onEvent);
  socket.on('team:changed', h.onTeam);
  socket.on('connect_error', async (err) => {
    // Server middleware rejections are not retried automatically: renew the token, then try again.
    if (err.message === 'unauthorized') {
      const renewed = await refreshSession();
      if (renewed && socket) socket.connect();
      else h.onAuthLost();
    }
  });
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
