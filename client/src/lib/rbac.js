// Two layers of permissions:
//  1. a global role on the user (admin / responder / viewer)
//  2. a per-incident role (commander / scribe / comms) that adds permissions
//     for that one incident only.
const GLOBAL = {
  admin: '*',
  responder: ['declare', 'message', 'log_action', 'edit_runbook', 'ack'],
  viewer: [],
};

const INCIDENT_ROLE = {
  commander: ['message', 'log_action', 'log_decision', 'change_severity', 'change_status', 'assign_roles', 'page', 'publish_status', 'edit_runbook', 'ack'],
  scribe: ['message', 'log_action', 'log_decision', 'edit_runbook'],
  comms: ['message', 'publish_status'],
};

export function can(user, incident, perm) {
  if (!user) return false;
  const base = GLOBAL[user.role];
  if (base === '*') return true;
  if (base && base.includes(perm)) return true;
  const roles = incident?.roles || {};
  return Object.entries(roles).some(([role, userId]) => userId === user.id && INCIDENT_ROLE[role]?.includes(perm));
}

export function myIncidentRoles(user, incident) {
  if (!user || !incident) return [];
  return Object.entries(incident.roles).filter(([, id]) => id === user.id).map(([role]) => role);
}
