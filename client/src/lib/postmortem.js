import { SEVERITIES, serviceName, userById, INCIDENT_ROLES, STATUSES } from './constants.js';
import { fmtClock, fmtDateTime, fmtDuration } from './time.js';

const label = (id) => STATUSES.find((s) => s.id === id)?.label || id;

// Builds a first draft straight from the event log, so nobody writes it from memory.
export function generatePostmortem(inc) {
  const ev = inc.events;
  const end = inc.resolvedAt || Date.now();
  const sevPeak = inc.severityHistory.reduce((m, s) => (SEVERITIES[s.sev].rank < SEVERITIES[m].rank ? s.sev : m), inc.severityHistory[0].sev);
  const decisions = ev.filter((e) => e.type === 'decision.logged');
  const actions = ev.filter((e) => e.type === 'action.logged');
  const firstUpdate = inc.statusUpdates[0];
  const tta = inc.ackedAt ? inc.ackedAt - inc.createdAt : null;
  const comms = firstUpdate ? firstUpdate.ts - inc.createdAt : null;
  const L = [];

  L.push(`# Postmortem: ${inc.title}`, '');
  L.push(`**${inc.code}** on **${serviceName(inc.service)}**. Peak severity **${SEVERITIES[sevPeak].label}**. ${inc.resolvedAt ? 'Resolved' : 'Still open'}.`, '');
  L.push('## Summary', inc.summary || 'Add a two-sentence description of what happened and who was affected.', '');
  L.push('## Impact', '- Describe customer impact here (who, how many, for how long).', `- Duration: ${fmtDuration(end - inc.createdAt)}${inc.resolvedAt ? '' : ' so far'}.`, '');
  L.push('## Key metrics');
  L.push(`- Detected: ${fmtDateTime(inc.createdAt)} via ${inc.source === 'manual' ? 'a manual report' : inc.source}`);
  L.push(`- Time to acknowledge: ${fmtDuration(tta)}${inc.ackedBy ? ` (by ${userById(inc.ackedBy).name})` : ''}`);
  L.push(`- Time to first customer update: ${fmtDuration(comms)}`);
  L.push(`- Time to resolve: ${inc.resolvedAt ? fmtDuration(inc.resolvedAt - inc.createdAt) : 'not yet resolved'}`);
  L.push(`- Escalation reached level ${inc.level} of 3`, '');
  L.push('## Response team');
  INCIDENT_ROLES.forEach((r) => L.push(`- ${r.label}: ${inc.roles[r.id] ? userById(inc.roles[r.id]).name : 'unassigned'}`));
  L.push('');

  L.push('## Timeline');
  for (const e of ev) {
    const q = e.payload || {};
    const who = userById(e.actor).name;
    let line = null;
    if (e.type === 'incident.created') line = `Incident declared by ${who}: ${q.title}`;
    else if (e.type === 'alert.received') line = `Alert ${q.state}: ${q.name} (${q.source})`;
    else if (e.type === 'escalation.paged' && !q.manual) line = `Paged ${userById(q.userId).name} (level ${q.level})`;
    else if (e.type === 'escalation.paged') line = `${who} paged ${userById(q.userId).name}`;
    else if (e.type === 'escalation.acked') line = `${who} acknowledged`;
    else if (e.type === 'incident.severity_changed') line = `Severity ${SEVERITIES[q.from]?.label} to ${SEVERITIES[q.to]?.label} by ${who}`;
    else if (e.type === 'incident.status_changed') line = `Status set to ${label(q.to)} by ${who}`;
    else if (e.type === 'decision.logged') line = `Decision (${who}): ${q.text}`;
    else if (e.type === 'action.logged') line = `Action (${who}): ${q.text}`;
    else if (e.type === 'statuspage.updated') line = `Status page (${label(q.state)}): ${q.text}`;
    if (line) L.push(`- **${fmtClock(e.ts)}** ${line}`);
  }
  L.push('');

  L.push('## Decisions made');
  if (decisions.length) decisions.forEach((d) => L.push(`- ${d.payload.text} (${userById(d.actor).name}, ${fmtClock(d.ts)})`));
  else L.push('- No decisions were logged.');
  L.push('');
  L.push('## Root cause', 'Fill in after the review. Use the timeline above to separate the trigger from the underlying cause.', '');
  L.push('## What went well', '- ', '', '## What went poorly', '- ', '');
  L.push('## Follow-up actions');
  if (actions.length) actions.forEach((a) => L.push(`- [ ] Review: ${a.payload.text}`));
  L.push('- [ ] Add monitoring that would have caught this earlier', '- [ ] Update the runbook with what we learned', '');
  return L.join('\n');
}
