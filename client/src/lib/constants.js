export const SEVERITIES = {
  sev1: { id: 'sev1', rank: 1, label: 'SEV 1', name: 'Critical', color: 'var(--sev1)', esc: 20, hint: 'Full outage, data loss, or security breach' },
  sev2: { id: 'sev2', rank: 2, label: 'SEV 2', name: 'Major', color: 'var(--sev2)', esc: 40, hint: 'Core feature broken for many customers' },
  sev3: { id: 'sev3', rank: 3, label: 'SEV 3', name: 'Minor', color: 'var(--sev3)', esc: 60, hint: 'Degraded performance or a partial feature issue' },
  sev4: { id: 'sev4', rank: 4, label: 'SEV 4', name: 'Low', color: 'var(--sev4)', esc: 90, hint: 'Cosmetic issue or something to watch' },
};

export const STATUSES = [
  { id: 'investigating', label: 'Investigating' },
  { id: 'identified', label: 'Identified' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'resolved', label: 'Resolved' },
];

export const SERVICES = [
  { id: 'api-gateway', name: 'API Gateway' },
  { id: 'auth', name: 'Authentication' },
  { id: 'payments', name: 'Payments' },
  { id: 'database', name: 'Primary Database' },
  { id: 'search', name: 'Search' },
  { id: 'notifications', name: 'Notifications' },
  { id: 'web-app', name: 'Web App' },
];

export const INCIDENT_ROLES = [
  { id: 'commander', label: 'Incident commander', blurb: 'Owns decisions, severity and status' },
  { id: 'scribe', label: 'Scribe', blurb: 'Keeps the record accurate and complete' },
  { id: 'comms', label: 'Communications', blurb: 'Writes customer-facing updates' },
];

// The team comes from the server. This array is mutated in place by setTeam(), so every
// module that imported it sees the update.
export const TEAM = [];
export const setTeam = (list) => TEAM.splice(0, TEAM.length, ...list);

// The server owns escalation timing; this keeps the countdown in the UI honest.
export function applyConfig(cfg) {
  for (const [id, secs] of Object.entries(cfg?.escalation || {})) if (SEVERITIES[id]) SEVERITIES[id].esc = secs;
}

const SYSTEM = {
  system: { id: 'system', name: 'War-Room', title: 'Automation', role: 'system', hue: 210 },
  webhook: { id: 'webhook', name: 'Monitoring', title: 'Webhook ingestion', role: 'system', hue: 190 },
};

export const userById = (id) =>
  TEAM.find((u) => u.id === id) || SYSTEM[id] || { id, name: String(id || 'Unknown'), title: '', role: 'viewer', hue: 210 };

export const serviceName = (id) => SERVICES.find((s) => s.id === id)?.name || id;

export const ROLE_LABEL = { admin: 'Admin', responder: 'Responder', viewer: 'Viewer', system: 'System' };

// The rotation shifts one position every week.
export function getOnCall(now = Date.now()) {
  const rot = TEAM.filter((u) => u.oncall).sort((a, b) => a.oncall - b.oncall);
  const week = Math.floor(now / 604800000);
  return rot.map((_, i) => rot[(week + i) % rot.length]);
}
