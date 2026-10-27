import Avatar from './Avatar.jsx';
import { INCIDENT_ROLES, TEAM, userById } from '../lib/constants.js';
import { assignRole } from '../lib/actions.js';
import { can } from '../lib/rbac.js';

export default function RolesPanel({ incident, me }) {
  const editable = can(me, incident, 'assign_roles') && incident.isOpen;
  return (
    <section className="panel glass">
      <h3>Roles</h3>
      <ul className="roles">
        {INCIDENT_ROLES.map((r) => {
          const uid = incident.roles[r.id];
          return (
            <li key={r.id}>
              {uid ? <Avatar id={uid} size={34} /> : <span className="avatar empty" style={{ width: 34, height: 34 }} />}
              <div className="grow">
                <strong>{r.label}</strong>
                {editable ? (
                  <select className="input slim" value={uid || ''} aria-label={`Assign ${r.label}`} onChange={(e) => assignRole(incident.id, r.id, e.target.value)}>
                    {TEAM.filter((u) => !u.disabled && (u.role !== 'viewer' || u.id === uid)).map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <span>{uid ? userById(uid).name : 'Unassigned'}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!editable && incident.isOpen && <p className="hint">Only the commander or an admin can change roles.</p>}
    </section>
  );
}
