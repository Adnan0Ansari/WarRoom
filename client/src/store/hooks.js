import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './useStore.js';
import { buildIncidents } from '../lib/reducer.js';
import { SEVERITIES, INCIDENT_ROLES, userById, serviceName } from '../lib/constants.js';

export function useIncidents() {
  const events = useStore((s) => s.events);
  return useMemo(() => buildIncidents(events), [events]);
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

// Turns new events into toasts for the person who needs to see them.
// (Escalation timers now live on the server in BullMQ, so there is no engine here.)
export function useNotifier() {
  const events = useStore((s) => s.events);
  const me = useStore((s) => s.me);
  const ready = useStore((s) => s.ready);
  const toast = useStore((s) => s.toast);
  const seen = useRef(null);

  useEffect(() => {
    if (!ready) {
      seen.current = null;
      return;
    }
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    const titles = new Map(events.filter((e) => e.type === 'incident.created').map((e) => [e.incidentId, e.payload.title]));
    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (!me || Date.now() - e.ts > 20000) continue;
      const q = e.payload || {};
      const title = titles.get(e.incidentId) || 'an incident';
      if (e.type === 'escalation.paged' && q.userId === me.id) toast('page', 'You are being paged', `${title}. ${q.manual ? 'A teammate paged you.' : `Level ${q.level}.`} Sent by SMS and email.`);
      else if (e.type === 'role.assigned' && q.userId === me.id && e.actor !== me.id) toast('info', `You are the ${INCIDENT_ROLES.find((r) => r.id === q.role)?.label.toLowerCase()}`, title);
      else if (e.type === 'incident.created' && e.actor !== me.id) toast('info', `New incident: ${SEVERITIES[q.severity]?.label}`, `${q.title} on ${serviceName(q.service)}`);
      else if (e.type === 'statuspage.updated' && e.actor !== me.id) toast('info', 'Status page updated', q.text);
      else if (e.type === 'incident.severity_changed' && e.actor !== me.id) toast('info', `Severity is now ${SEVERITIES[q.to]?.label}`, `${userById(e.actor).name} changed it on ${title}.`);
    }
  }, [events, me, ready, toast]);
}
