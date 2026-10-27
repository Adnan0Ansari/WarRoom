import test from 'node:test';
import assert from 'node:assert/strict';
import { foldIncident, byTime, codeFor } from '../src/domain/fold.js';
import { can } from '../src/domain/rbac.js';
import { rotation } from '../src/domain/oncall.js';
import { normalizeAlerts } from '../src/domain/normalize.js';
import { runbookTemplate } from '../src/domain/runbook.js';

const ev = (id, ts, type, actor, payload = {}) => ({ id, incidentId: 'inc_t', ts, type, actor, payload });
const base = [
  ev('1', 1000, 'incident.created', 'u1', { title: 'DB down', severity: 'sev1', service: 'database', oncall: ['a', 'b', 'c'] }),
  ev('2', 1001, 'role.assigned', 'system', { role: 'commander', userId: 'a' }),
  ev('3', 1002, 'escalation.paged', 'system', { level: 1, userId: 'a' }),
];

test('fold derives roles, level and open state', () => {
  const inc = foldIncident('inc_t', base);
  assert.equal(inc.roles.commander, 'a');
  assert.equal(inc.level, 1);
  assert.equal(inc.lastAutoPageAt, 1002);
  assert.equal(inc.isOpen, true);
  assert.equal(inc.code, codeFor('inc_t'));
});

test('only the first ack counts and resolve closes the incident', () => {
  const list = [...base, ev('4', 2000, 'escalation.acked', 'a'), ev('5', 2500, 'escalation.acked', 'b'), ev('6', 3000, 'incident.status_changed', 'a', { to: 'resolved' })];
  const inc = foldIncident('inc_t', list);
  assert.equal(inc.ackedBy, 'a');
  assert.equal(inc.ackedAt, 2000);
  assert.equal(inc.isOpen, false);
  assert.equal(inc.resolvedAt, 3000);
});

test('manual pages never raise the escalation level', () => {
  const inc = foldIncident('inc_t', [...base, ev('7', 1500, 'escalation.paged', 'a', { level: 1, userId: 'z', manual: true })]);
  assert.equal(inc.level, 1);
  assert.equal(inc.pages.length, 2);
});

test('events sort by time then id', () => {
  const sorted = [ev('b', 5, 'x'), ev('a', 5, 'x'), ev('c', 1, 'x')].sort(byTime).map((e) => e.id);
  assert.deepEqual(sorted, ['c', 'a', 'b']);
});

test('rbac: global roles and per-incident roles', () => {
  const inc = { roles: { commander: 'u2', scribe: null, comms: 'u4' } };
  assert.equal(can({ id: 'u1', role: 'admin' }, inc, 'page'), true);
  assert.equal(can({ id: 'u9', role: 'viewer' }, inc, 'message'), false);
  assert.equal(can({ id: 'u2', role: 'viewer' }, inc, 'change_severity'), true);
  assert.equal(can({ id: 'u4', role: 'responder' }, inc, 'publish_status'), true);
  assert.equal(can({ id: 'u4', role: 'responder' }, inc, 'change_severity'), false);
  assert.equal(can(null, inc, 'message'), false);
});

test('on-call rotation shifts weekly and skips disabled users', () => {
  const users = [{ uid: 'a', oncall: 1 }, { uid: 'b', oncall: 2 }, { uid: 'c', oncall: 3, disabled: true }, { uid: 'd' }];
  const w0 = rotation(users, 0).map((u) => u.uid);
  const w1 = rotation(users, 604800000).map((u) => u.uid);
  assert.deepEqual(w0, ['a', 'b']);
  assert.deepEqual(w1, ['b', 'a']);
});

test('webhook normalisation for each source', () => {
  const p = normalizeAlerts('prometheus', { alerts: [{ status: 'firing', fingerprint: 'f1', labels: { alertname: 'HighErrorRate', service: 'payments', severity: 'critical' }, annotations: { summary: 'boom' } }] });
  assert.equal(p[0].severity, 'sev1');
  assert.equal(p[0].service, 'payments');
  const d = normalizeAlerts('datadog', { title: 'Lag', alert_type: 'success', tags: 'service:postgres,env:prod' });
  assert.equal(d[0].state, 'resolved');
  assert.equal(d[0].service, 'database');
  const c = normalizeAlerts('custom', { title: 'Queue', service: 'notifications', severity: 'nope' });
  assert.equal(c[0].severity, 'sev3');
  assert.throws(() => normalizeAlerts('custom', {}), /title/);
  assert.throws(() => normalizeAlerts('prometheus', { alerts: [] }), /alerts/);
});

test('runbook template mentions the service and has checklist items', () => {
  const t = runbookTemplate({ title: 'X', service: 'payments', severity: 'sev2' });
  assert.match(t, /Payments/);
  assert.ok((t.match(/- \[ \]/g) || []).length >= 7);
});
