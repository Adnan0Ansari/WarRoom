import { serviceName, SEVERITY_LABEL } from './constants.js';

const BY_SERVICE = {
  payments: ['Check processor status page and our retry/queue depth', 'Compare error rate by card network and region', 'Confirm no payment is double-charged: sample the last 50 charges'],
  database: ['Check replication lag and connection pool saturation', 'Look for long-running queries and lock waits', 'Decide whether to fail over; log the decision with the commander'],
  auth: ['Check token signing keys and JWKS cache freshness', 'Compare 401 rate by client version', 'Verify the identity provider is reachable'],
  'api-gateway': ['Check upstream health and 5xx rate by route', 'Look at rate limiter and WAF rule changes', 'Check certificate expiry and DNS'],
  search: ['Check index freshness and shard health', 'Look at query latency by tenant', 'Confirm the last reindex job finished'],
  notifications: ['Check queue depth and worker concurrency', 'Check the email/SMS provider status', 'Look for a poison message blocking the queue'],
  'web-app': ['Check the CDN and the last frontend deploy', 'Look at client-side error rate by browser', 'Roll back the last release if errors began at deploy time'],
};

export function runbookTemplate(initial) {
  const steps = BY_SERVICE[initial.service] || ['Check dashboards and recent changes for this service'];
  return [
    `# Runbook: ${initial.title}`,
    ``,
    `Service **${serviceName(initial.service)}**, opened as **${SEVERITY_LABEL[initial.severity] || initial.severity}**.`,
    ``,
    `## First five minutes`,
    `- [ ] Acknowledge the page and join the war-room`,
    `- [ ] Confirm customer impact and write it in the timeline`,
    `- [ ] Check what changed in the last 2 hours (deploys, flags, config)`,
    `- [ ] Post the first status page update`,
    ``,
    `## Service checks`,
    ...steps.map((s) => `- [ ] ${s}`),
    ``,
    `## Mitigation options`,
    `- Roll back the most recent change`,
    `- Disable the suspect feature flag`,
    `- Scale out or fail over`,
    ``,
    `## Notes`,
    `Write findings here. Everyone in the room edits this page live.`,
    ``,
  ].join('\n');
}
