// Event sourcing core. Identical logic runs in the browser, so the client and the
// server always agree on what an incident looks like for a given event list.
export function codeFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 'INC-' + (1000 + (h % 9000));
}

export const byTime = (a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id < b.id ? -1 : 1);

export function foldIncident(id, list) {
  const first = list.find((e) => e.type === 'incident.created');
  if (!first) return null;
  const p = first.payload;
  const inc = {
    id,
    code: codeFor(id),
    title: p.title,
    summary: p.summary || '',
    service: p.service,
    severity: p.severity,
    initial: { title: p.title, severity: p.severity, service: p.service },
    status: 'investigating',
    source: p.source || 'manual',
    createdAt: first.ts,
    createdBy: first.actor,
    resolvedAt: null,
    oncall: p.oncall || [],
    roles: { commander: null, scribe: null, comms: null },
    events: list,
    alerts: [],
    pages: [],
    ackedAt: null,
    ackedBy: null,
    statusUpdates: [],
    severityHistory: [{ sev: p.severity, ts: first.ts }],
  };

  for (const e of list) {
    const q = e.payload || {};
    switch (e.type) {
      case 'incident.severity_changed':
        inc.severity = q.to;
        inc.severityHistory.push({ sev: q.to, ts: e.ts });
        break;
      case 'incident.status_changed':
        inc.status = q.to;
        inc.resolvedAt = q.to === 'resolved' ? e.ts : null;
        break;
      case 'role.assigned':
        inc.roles[q.role] = q.userId;
        break;
      case 'alert.received':
        inc.alerts.push({ ...q, ts: e.ts, id: e.id });
        break;
      case 'escalation.paged':
        inc.pages.push({ level: q.level, userId: q.userId, manual: !!q.manual, ts: e.ts });
        break;
      case 'escalation.acked':
        if (!inc.ackedAt) {
          inc.ackedAt = e.ts;
          inc.ackedBy = e.actor;
        }
        break;
      case 'statuspage.updated':
        inc.statusUpdates.push({ text: q.text, state: q.state, ts: e.ts, by: e.actor, notified: q.notified || 0 });
        break;
      default:
        break;
    }
  }

  const auto = inc.pages.filter((x) => !x.manual);
  inc.level = auto.length ? Math.max(...auto.map((x) => x.level)) : 0;
  inc.lastAutoPageAt = auto.length ? Math.max(...auto.map((x) => x.ts)) : null;
  inc.isOpen = inc.status !== 'resolved';
  return inc;
}
