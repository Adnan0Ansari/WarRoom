import { Queue, Worker } from 'bullmq';
import { Incident, Notification, Subscriber, User } from '../models/index.js';
import { makeRedis } from '../redis.js';
import { config } from '../config.js';
import { SEVERITY_LABEL, serviceName } from '../domain/constants.js';
import { sendEmail, sendSms } from './providers.js';
import { log } from '../logger.js';

const NAME = 'notify';
let queue = null;
let worker = null;
const jobOpts = { attempts: 4, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 500, removeOnFail: 500 };

export function startNotify() {
  queue = new Queue(NAME, { connection: makeRedis() });
  worker = new Worker(NAME, process, { connection: makeRedis(), concurrency: 5 });
  worker.on('failed', (job, err) => log.error(`notify job ${job?.name}/${job?.id} failed:`, err.message));
  log.info('Notification queue ready');
}

export async function stopNotify() {
  await worker?.close();
  await queue?.close();
}

export const enqueuePage = (evt, inc) =>
  queue?.add('page', { incidentId: inc.id, userId: evt.payload.userId, level: evt.payload.level, manual: !!evt.payload.manual, by: evt.actor }, { ...jobOpts, jobId: `page-${evt.id}` });

export const enqueueSubscriberUpdate = (evt, inc) =>
  queue?.add('subscribers', { incidentId: inc.id, text: evt.payload.text, state: evt.payload.state }, { ...jobOpts, jobId: `sub-${evt.id}` });

export const enqueueRoleEmail = (evt, inc) =>
  queue?.add('role', { incidentId: inc.id, userId: evt.payload.userId, role: evt.payload.role, by: evt.actor }, { ...jobOpts, jobId: `role-${evt.id}` });

async function record(base, status, provider, error = '') {
  await Notification.create({ ...base, status, provider, error }).catch(() => {});
}

async function deliver(channel, base, send) {
  try {
    const provider = await send();
    await record({ ...base, channel }, 'sent', provider);
  } catch (err) {
    await record({ ...base, channel }, 'failed', '', err.message);
    throw err; // lets BullMQ retry with backoff
  }
}

async function process(job) {
  if (job.name === 'page') return pageJob(job.data);
  if (job.name === 'subscribers') return subscribersJob(job.data);
  if (job.name === 'role') return roleJob(job.data);
}

async function pageJob({ incidentId, userId, level, manual, by }) {
  const [user, inc] = await Promise.all([User.findOne({ uid: userId }).lean(), Incident.findById(incidentId).lean()]);
  if (!user || !inc) return;
  const link = `${config.APP_URL}/incidents/${incidentId}`;
  const lead = `[${SEVERITY_LABEL[inc.severity]}] ${inc.title} on ${serviceName(inc.service)}`;
  const why = manual ? `${by === 'system' ? 'System' : 'A teammate'} paged you.` : `You are level ${level} on the escalation policy.`;
  const base = { incidentId, kind: 'page', to: '' };

  await deliver('email', { ...base, to: user.email, subject: lead, body: `${why}\n\n${lead}\n\nOpen the war-room and acknowledge: ${link}` }, () =>
    sendEmail({ to: user.email, subject: `Paged: ${lead}`, text: `${why}\n\n${lead}\n\nOpen the war-room and acknowledge: ${link}\n` })
  );
  if (user.phone) {
    const body = `Tidewater page: ${lead}. Ack: ${link}`;
    await deliver('sms', { ...base, to: user.phone, subject: '', body }, () => sendSms({ to: user.phone, body }));
  } else {
    await record({ ...base, channel: 'sms', to: user.email }, 'skipped', '', 'No phone number on file');
  }
}

async function roleJob({ incidentId, userId, role, by }) {
  const [user, inc, actor] = await Promise.all([User.findOne({ uid: userId }).lean(), Incident.findById(incidentId).lean(), User.findOne({ uid: by }).lean()]);
  if (!user || !inc) return;
  const text = `${actor?.name || 'Someone'} made you ${role} for "${inc.title}".\n\n${config.APP_URL}/incidents/${incidentId}\n`;
  await deliver('email', { incidentId, kind: 'role', to: user.email, subject: `You are the ${role}`, body: text }, () => sendEmail({ to: user.email, subject: `You are the ${role}: ${inc.title}`, text }));
}

async function subscribersJob({ incidentId, text, state }) {
  const inc = await Incident.findById(incidentId).lean();
  if (!inc) return;
  const subs = await Subscriber.find().lean();
  for (const s of subs) {
    const body = `${text}\n\nStatus: ${state}\nAffected: ${serviceName(inc.service)}\n\nUnsubscribe: ${config.API_PUBLIC_URL}/api/public/unsubscribe/${s.token}\n`;
    await deliver('email', { incidentId, kind: 'subscriber', to: s.email, subject: inc.title, body }, () => sendEmail({ to: s.email, subject: `Update: ${inc.title}`, text: body }));
  }
}
