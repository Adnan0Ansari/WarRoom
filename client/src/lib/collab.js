import * as Y from 'yjs';

// Syncs a Y.Doc through the server over Socket.IO. The server keeps the authoritative copy,
// persists it to MongoDB and relays updates to everyone else in the room (across servers
// via Redis). Because Yjs is a CRDT, edits made while offline simply merge on reconnect.
export class RunbookProvider {
  constructor(incidentId, user, socket) {
    this.id = incidentId;
    this.user = user;
    this.socket = socket;
    this.doc = new Y.Doc();
    this.ytext = this.doc.getText('runbook');
    this.peers = new Map();
    this.peerListeners = new Set();
    this.statusListeners = new Set();
    this.status = 'connecting';

    this.onDocUpdate = (update, origin) => {
      if (origin === 'remote') return;
      this.socket.emit('yjs:update', { incidentId: this.id, update });
    };
    this.doc.on('update', this.onDocUpdate);

    this.handlers = {
      'yjs:update': (m) => {
        if (m.incidentId === this.id) Y.applyUpdate(this.doc, new Uint8Array(m.update), 'remote');
      },
      'rb:presence': (m) => {
        if (m.incidentId !== this.id) return;
        this.peers.set(m.sid, { user: m.user, ts: Date.now() });
        this.emitPeers();
      },
      'rb:bye': (m) => {
        if (m.incidentId !== this.id) return;
        this.peers.delete(m.sid);
        this.emitPeers();
      },
      connect: () => this.join(),
      disconnect: () => this.setStatus('offline'),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) socket.on(ev, fn);

    if (socket.connected) this.join();
    else this.setStatus('offline');
    this.beat = setInterval(() => {
      this.announce();
      this.prune();
    }, 2500);
  }

  join() {
    this.setStatus('connecting');
    this.socket.timeout(8000).emit('yjs:join', { incidentId: this.id }, (err, res) => {
      if (err || !res?.ok) return this.setStatus('error');
      if (res.state) Y.applyUpdate(this.doc, new Uint8Array(res.state), 'remote');
      // Send everything we hold. Anything typed while offline reaches the server; the rest is a no-op.
      this.socket.emit('yjs:update', { incidentId: this.id, update: Y.encodeStateAsUpdate(this.doc) });
      this.setStatus('synced');
      this.announce();
    });
  }

  setStatus(s) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  announce() {
    if (this.socket.connected && this.status === 'synced') this.socket.emit('rb:presence', { incidentId: this.id });
  }

  prune() {
    const cutoff = Date.now() - 7000;
    let changed = false;
    for (const [k, v] of this.peers) {
      if (v.ts < cutoff) {
        this.peers.delete(k);
        changed = true;
      }
    }
    if (changed) this.emitPeers();
  }

  emitPeers() {
    const byId = new Map();
    for (const p of this.peers.values()) if (p.user.id !== this.user.id) byId.set(p.user.id, p.user);
    const list = [...byId.values()];
    this.peerListeners.forEach((fn) => fn(list));
  }

  onPeers(fn) {
    this.peerListeners.add(fn);
    return () => this.peerListeners.delete(fn);
  }

  destroy() {
    clearInterval(this.beat);
    if (this.socket.connected) this.socket.emit('yjs:leave', { incidentId: this.id });
    for (const [ev, fn] of Object.entries(this.handlers)) this.socket.off(ev, fn);
    this.doc.off('update', this.onDocUpdate);
    this.doc.destroy();
  }
}

// Turns a textarea edit into a minimal Y.Text change (common prefix/suffix diff).
export function applyTextDiff(ytext, next) {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const max = Math.min(prev.length, next.length);
  while (start < max && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  ytext.doc.transact(() => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  }, 'local-edit');
}

// Moves a caret position through a Yjs delta so your cursor does not jump
// when someone else types above it.
export function shiftThroughDelta(delta, pos) {
  let idx = 0;
  let shift = 0;
  for (const op of delta) {
    if (op.retain) idx += op.retain;
    else if (op.insert) {
      if (idx <= pos) shift += op.insert.length;
    } else if (op.delete) {
      if (idx < pos) shift -= Math.min(op.delete, pos - idx);
      idx += op.delete;
    }
  }
  return Math.max(0, pos + shift);
}

// Flips "- [ ]" and "- [x]" on one line of the shared text.
export function toggleChecklistLine(ytext, lineIndex) {
  const lines = ytext.toString().split('\n');
  const line = lines[lineIndex];
  const m = line && /^(\s*- \[)( |x)(\])/.exec(line);
  if (!m) return;
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) offset += lines[i].length + 1;
  const pos = offset + m[1].length;
  ytext.doc.transact(() => {
    ytext.delete(pos, 1);
    ytext.insert(pos, m[2] === ' ' ? 'x' : ' ');
  }, 'local-edit');
}
