import bcrypt from 'bcryptjs';
import { User, Integration } from '../models/index.js';
import { appendEvents } from './eventService.js';
import { config } from '../config.js';
import { randomToken } from '../utils.js';
import { log } from '../logger.js';

const MIN = 60000;
const DAY = 86400000;

const DEMO_USERS = [
  { uid: 'u1', email: 'maya@tidewater.dev', name: 'Maya Okafor', title: 'Engineering manager', role: 'admin', hue: 18, oncall: 4, skills: ['commander'] },
  { uid: 'u2', email: 'arjun@tidewater.dev', name: 'Arjun Mehta', title: 'Site reliability engineer', role: 'responder', hue: 215, oncall: 1, skills: ['commander'] },
  { uid: 'u3', email: 'lena@tidewater.dev', name: 'Lena Fischer', title: 'Backend engineer', role: 'responder', hue: 150, oncall: 2, skills: [] },
  { uid: 'u4', email: 'tomas@tidewater.dev', name: 'Tomas Rivera', title: 'Support lead', role: 'responder', hue: 340, oncall: null, skills: ['comms'] },
  { uid: 'u5', email: 'priya@tidewater.dev', name: 'Priya Nair', title: 'Platform engineer', role: 'responder', hue: 265, oncall: 3, skills: ['scribe'] },
  { uid: 'u6', email: 'sam@tidewater.dev', name: 'Sam Whitaker', title: 'Customer success', role: 'viewer', hue: 45, oncall: null, skills: [] },
];

function build(id, startedAt, spec) {
  return spec.map((s, i) => ({ id: `seed-${id}-${i}`, incidentId: id, type: s[1], actor: s[2], ts: startedAt + s[0], payload: s[3] }));
}

function seedEvents(now = Date.now()) {
  const a = build('inc_seed_a', now - 2 * DAY, [
    [0, 'incident.created', 'webhook', { title: 'Checkout latency spike from card processor retries', severity: 'sev2', service: 'payments', summary: 'p95 latency on /charge climbed past 4s.', source: 'prometheus', oncall: ['u2', 'u3', 'u5'] }],
    [1000, 'role.assigned', 'system', { role: 'commander', userId: 'u2', auto: true }],
    [1100, 'role.assigned', 'system', { role: 'scribe', userId: 'u3', auto: true }],
    [1200, 'role.assigned', 'system', { role: 'comms', userId: 'u4', auto: true }],
    [1300, 'escalation.paged', 'system', { level: 1, userId: 'u2' }],
    [2000, 'alert.received', 'webhook', { source: 'prometheus', name: 'HighChargeLatency', detail: 'p95 > 4s for 5m', state: 'firing', fingerprint: 'hcl-1', severity: 'sev2' }],
    [3 * MIN, 'escalation.acked', 'u2', {}],
    [4 * MIN, 'message.posted', 'u2', { text: 'Looking at the processor dashboard. Retry volume is 6x normal.' }],
    [7 * MIN, 'action.logged', 'u3', { text: 'Checked recent deploys: nothing shipped to payments in the last 24h.' }],
    [11 * MIN, 'statuspage.updated', 'u4', { text: 'Some customers are seeing slow checkouts. We are investigating.', state: 'investigating', notified: 0 }],
    [16 * MIN, 'decision.logged', 'u2', { text: 'Cap retries at 2 with jitter via the feature flag to relieve pressure on the processor.' }],
    [19 * MIN, 'incident.status_changed', 'u2', { to: 'identified' }],
    [22 * MIN, 'action.logged', 'u3', { text: 'Flag payments.retry_cap=2 rolled out to 100%.' }],
    [31 * MIN, 'incident.status_changed', 'u2', { to: 'monitoring' }],
    [33 * MIN, 'statuspage.updated', 'u4', { text: 'A fix is in place and latency is returning to normal.', state: 'monitoring', notified: 0 }],
    [54 * MIN, 'incident.status_changed', 'u2', { to: 'resolved' }],
    [55 * MIN, 'statuspage.updated', 'u4', { text: 'Checkout is operating normally. Thanks for your patience.', state: 'resolved', notified: 0 }],
  ]);
  const b = build('inc_seed_b', now - 6 * DAY, [
    [0, 'incident.created', 'u3', { title: 'Elevated 401s after signing key rotation', severity: 'sev3', service: 'auth', summary: 'Some mobile clients rejected after rotation.', source: 'manual', oncall: ['u3', 'u5', 'u1'] }],
    [1000, 'role.assigned', 'system', { role: 'commander', userId: 'u3', auto: true }],
    [1100, 'role.assigned', 'system', { role: 'scribe', userId: 'u5', auto: true }],
    [1200, 'role.assigned', 'system', { role: 'comms', userId: 'u4', auto: true }],
    [1300, 'escalation.paged', 'system', { level: 1, userId: 'u3' }],
    [90000, 'escalation.acked', 'u3', {}],
    [5 * MIN, 'action.logged', 'u5', { text: 'Old public key missing from the JWKS cache on two edge nodes.' }],
    [9 * MIN, 'decision.logged', 'u3', { text: 'Republish the previous key alongside the new one for 24h.' }],
    [14 * MIN, 'incident.status_changed', 'u3', { to: 'monitoring' }],
    [27 * MIN, 'incident.status_changed', 'u3', { to: 'resolved' }],
  ]);
  return [...a, ...b];
}

// First boot only. Safe to run on every start: it does nothing once a user exists.
export async function seedIfEmpty() {
  if (await User.countDocuments()) return;

  if (config.SEED_DEMO) {
    const passwordHash = await bcrypt.hash(config.DEMO_PASSWORD, 10);
    await User.insertMany(DEMO_USERS.map((u) => ({ ...u, passwordHash })));
    for (const [name, source] of [['Prometheus Alertmanager', 'prometheus'], ['Datadog monitors', 'datadog'], ['Custom scripts', 'custom']]) {
      await Integration.create({ name, source, token: randomToken(24), createdBy: 'system' });
    }
    await appendEvents(seedEvents(), { silent: true });
    log.info(`Seeded demo team (password "${config.DEMO_PASSWORD}"), integrations and two resolved incidents`);
    return;
  }

  if (config.ADMIN_EMAIL && config.ADMIN_PASSWORD) {
    await User.create({ uid: 'u1', email: config.ADMIN_EMAIL, name: 'Admin', role: 'admin', oncall: 1, skills: ['commander'], passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 12) });
    log.info(`Created admin ${config.ADMIN_EMAIL}`);
  } else {
    log.warn('No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD (or SEED_DEMO=true) and restart.');
  }
}
