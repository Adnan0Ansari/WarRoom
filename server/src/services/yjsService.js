import * as Y from 'yjs';
import { Incident, RunbookDoc } from '../models/index.js';
import { runbookTemplate } from '../domain/runbook.js';
import { makeRedis } from '../redis.js';
import { newId } from '../utils.js';
import { log } from '../logger.js';

const docs = new Map(); // incidentId -> { doc, used, timer }
const loading = new Map();
const INSTANCE = newId();
const CHANNEL = 'wr:yjs';
let pub = null;
let sub = null;
let sweeper = null;

// Same trick as the browser used to use: a fixed clientID makes the seed text byte-identical
// everywhere, so merging it twice never duplicates it.
function seedUpdate(initial) {
  const d = new Y.Doc();
  d.clientID = 1;
  d.getText('runbook').insert(0, runbookTemplate(initial));
  return Y.encodeStateAsUpdate(d);
}

export function startYjs() {
  pub = makeRedis();
  sub = makeRedis();
  sub.subscribe(CHANNEL);
  // Other servers relay edits here so every instance keeps its cached copy converged.
  sub.on('message', (_ch, raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.inst === INSTANCE) return;
      const entry = docs.get(m.incidentId);
      if (entry) Y.applyUpdate(entry.doc, new Uint8Array(Buffer.from(m.update, 'base64')), 'redis');
    } catch (e) {
      log.warn('bad yjs relay message:', e.message);
    }
  });
  sweeper = setInterval(evictIdle, 60000);
  sweeper.unref();
}

async function save(incidentId, doc) {
  await RunbookDoc.updateOne({ _id: incidentId }, { $set: { state: Buffer.from(Y.encodeStateAsUpdate(doc)), updatedAt: new Date() } }, { upsert: true });
}

async function load(incidentId) {
  const inc = await Incident.findById(incidentId).lean();
  if (!inc) return null;
  const doc = new Y.Doc();
  const saved = await RunbookDoc.findById(incidentId);
  if (saved?.state) Y.applyUpdate(doc, new Uint8Array(saved.state), 'load');
  else {
    Y.applyUpdate(doc, seedUpdate(inc.initial), 'seed');
    await save(incidentId, doc);
  }
  const entry = { doc, used: Date.now(), timer: null };
  doc.on('update', (update, origin) => {
    entry.used = Date.now();
    if (origin === 'client') pub.publish(CHANNEL, JSON.stringify({ inst: INSTANCE, incidentId, update: Buffer.from(update).toString('base64') })).catch(() => {});
    if (origin === 'client') {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => save(incidentId, doc).catch((e) => log.error('runbook save failed:', e.message)), 400);
    }
  });
  docs.set(incidentId, entry);
  return entry;
}

export async function getDoc(incidentId) {
  const hit = docs.get(incidentId);
  if (hit) {
    hit.used = Date.now();
    return hit;
  }
  if (!loading.has(incidentId)) loading.set(incidentId, load(incidentId).finally(() => loading.delete(incidentId)));
  return loading.get(incidentId);
}

export async function fullState(incidentId) {
  const entry = await getDoc(incidentId);
  return entry ? Buffer.from(Y.encodeStateAsUpdate(entry.doc)) : null;
}

export async function applyClientUpdate(incidentId, update) {
  const entry = await getDoc(incidentId);
  if (!entry) throw new Error('Unknown incident');
  Y.applyUpdate(entry.doc, new Uint8Array(update), 'client');
}

async function evictIdle() {
  const cutoff = Date.now() - 10 * 60000;
  for (const [id, e] of docs) {
    if (e.used < cutoff) {
      clearTimeout(e.timer);
      await save(id, e.doc).catch(() => {});
      e.doc.destroy();
      docs.delete(id);
    }
  }
}

export async function stopYjs() {
  clearInterval(sweeper);
  for (const [id, e] of docs) {
    clearTimeout(e.timer);
    await save(id, e.doc).catch(() => {});
  }
  sub?.disconnect();
  pub?.disconnect();
}
