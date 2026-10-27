// Holds the Socket.IO instance so services can broadcast without importing socket.js
// (which would create an import cycle).
let io = null;
export const setIo = (instance) => {
  io = instance;
};
export const getIo = () => io;

export function emitTeam(event, data) {
  io?.to('team').emit(event, data);
}

export function emitPublicChanged() {
  io?.of('/public').emit('status:changed', { at: Date.now() });
}
