import { SERVICES, SEVERITY_IDS } from './constants.js';

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function matchService(raw) {
  const s = String(raw || '').toLowerCase();
  if (/(^|\W)(db|postgres|mysql|mongo)/.test(s)) return 'database';
  const hit = SERVICES.find((x) => s.includes(x.id) || s.includes(x.id.split('-')[0]));
  return hit ? hit.id : 'api-gateway';
}

// Turns a monitoring tool's payload into one common alert shape.
export function normalizeAlerts(source, p) {
  if (!p || typeof p !== 'object') throw bad('The body must be a JSON object.');

  if (source === 'prometheus') {
    if (!Array.isArray(p.alerts) || !p.alerts.length) throw bad('Alertmanager payloads need an "alerts" array.');
    return p.alerts.slice(0, 50).map((a) => {
      const l = a.labels || {};
      const sev = { critical: 'sev1', page: 'sev2', error: 'sev2', warning: 'sev3', info: 'sev4' }[String(l.severity).toLowerCase()] || 'sev3';
      return {
        source,
        fingerprint: String(a.fingerprint || `${l.alertname}-${l.service}`),
        state: a.status === 'resolved' ? 'resolved' : 'firing',
        name: String(l.alertname || 'Alert').slice(0, 160),
        detail: String(a.annotations?.summary || a.annotations?.description || '').slice(0, 500),
        service: matchService(l.service || l.job || l.instance),
        severity: sev,
      };
    });
  }

  if (source === 'datadog') {
    if (!p.title) throw bad('Datadog payloads need a "title".');
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',');
    const svcTag = tags.find((t) => String(t).trim().startsWith('service:'));
    const sev = /^p1$/i.test(p.priority || '') ? 'sev1' : { error: 'sev2', warning: 'sev3', info: 'sev4' }[p.alert_type] || 'sev3';
    return [
      {
        source,
        fingerprint: String(p.alert_id || p.title),
        state: p.alert_type === 'success' ? 'resolved' : 'firing',
        name: String(p.title).slice(0, 160),
        detail: String(p.body || '').slice(0, 500),
        service: matchService(svcTag ? String(svcTag).split(':')[1] : p.title),
        severity: sev,
      },
    ];
  }

  if (!p.title) throw bad('Custom payloads need a "title". Optional: service, severity, message, state, id.');
  return [
    {
      source: 'custom',
      fingerprint: String(p.id || p.title),
      state: p.state === 'resolved' ? 'resolved' : 'firing',
      name: String(p.title).slice(0, 160),
      detail: String(p.message || '').slice(0, 500),
      service: matchService(p.service),
      severity: SEVERITY_IDS.includes(p.severity) ? p.severity : 'sev3',
    },
  ];
}
