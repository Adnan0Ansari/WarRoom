import { Queue, Worker } from 'bullmq';
import { Incident } from '../models/index.js';
import { escalationSeconds } from '../config.js';
import { makeRedis } from '../redis.js';
import { appendEvents } from './eventService.js';
import { log } from '../logger.js';

const NAME = 'escalation';
let queue = null;
let worker = null;

// Each page-next job is a delayed BullMQ job with a deterministic id, so scheduling is idempotent.
// Redis keeps the timers, so they survive restarts and run on whichever server is free.
export function startEscalation() {
  queue = new Queue(NAME, { connection: makeRedis() });
  worker = new Worker(NAME, processJob, { connection: makeRedis(), concurrency: 5 });
  worker.on('failed', (job, err) => log.error(`escalation job ${job?.id} failed:`, err.message));
  log.info('Escalation queue ready');
}

export async function stopEscalation() {
  await worker?.close();
  await queue?.close();
}

const jobId = (incidentId, level) => `esc-${incidentId}-${level}`;

export async function scheduleNext(inc) {
  if (!queue || !inc?.isOpen || inc.ackedAt || inc.level < 1 || inc.level >= 3) return;
  const next = inc.level + 1;
  if (!inc.oncall?.[next - 1]) return;
  const wait = escalationSeconds[inc.severity] * 1000;
  const delay = Math.max(0, (inc.lastAutoPageAt || Date.now()) + wait - Date.now());
  await queue.add(
    'page-next',
    { incidentId: inc.id, level: next },
    { jobId: jobId(inc.id, next), delay, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 200 }
  );
}

export async function cancelEscalation(incidentId) {
  if (!queue) return;
  for (const level of [2, 3]) {
    const job = await queue.getJob(jobId(incidentId, level));
    if (job) await job.remove().catch(() => {}); // an already-running job re-checks state itself
  }
}

async function processJob(job) {
  const { incidentId, level } = job.data;
  const inc = await Incident.findById(incidentId).lean();
  // Re-check everything: the incident may have been acknowledged or resolved while we waited.
  if (!inc || !inc.isOpen || inc.ackedAt || inc.level !== level - 1) return { skipped: true };
  const userId = inc.oncall?.[level - 1];
  if (!userId) return { skipped: true };
  await appendEvents([{ id: jobId(incidentId, level), incidentId, type: 'escalation.paged', actor: 'system', payload: { level, userId } }]);
  // If a previous attempt stored the event but died before scheduling, this heals the chain.
  const fresh = await Incident.findById(incidentId).lean();
  await scheduleNext({ ...fresh, id: incidentId });
  return { paged: userId, level };
}

// After a restart, make sure every open, unacknowledged incident still has its next timer.
export async function resumeEscalations() {
  const open = await Incident.find({ isOpen: true, ackedAt: null, level: { $gte: 1, $lt: 3 } }).lean();
  for (const inc of open) await scheduleNext({ ...inc, id: inc._id });
  if (open.length) log.info(`Resumed escalation timers for ${open.length} incident(s)`);
}
