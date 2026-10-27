import { useState } from 'react';
import { Bell, CheckCircle2, Phone } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { SEVERITIES, TEAM, userById } from '../lib/constants.js';
import { acknowledge, pageSomeone } from '../lib/actions.js';
import { can } from '../lib/rbac.js';
import { useNow } from '../store/hooks.js';
import { fmtClock } from '../lib/time.js';

export default function EscalationPanel({ incident: inc, me }) {
  const now = useNow();
  const [target, setTarget] = useState('');
  const timeout = SEVERITIES[inc.severity].esc * 1000;
  const remaining = inc.lastAutoPageAt ? Math.max(0, inc.lastAutoPageAt + timeout - now) : 0;
  const waiting = inc.isOpen && !inc.ackedAt && inc.level < 3;
  const pagedBy = (n) => inc.pages.find((p) => !p.manual && p.level === n);

  return (
    <section className="panel glass">
      <h3>Escalation</h3>
      {inc.ackedAt ? (
        <div className="callout ok">
          <CheckCircle2 size={16} /> Acknowledged by {userById(inc.ackedBy).name}. Escalation is paused.
        </div>
      ) : inc.isOpen ? (
        <div className="callout warn">
          <Bell size={16} />
          {waiting ? <span>Next page in <strong>{Math.ceil(remaining / 1000)}s</strong> unless someone acknowledges.</span> : <span>Everyone on the policy has been paged.</span>}
        </div>
      ) : null}

      <ol className="ladder">
        {[1, 2, 3].map((n) => {
          const p = pagedBy(n);
          const uid = inc.oncall[n - 1];
          return (
            <li key={n} className={p ? 'sent' : ''}>
              <span className="rung">{n}</span>
              {uid && <Avatar id={uid} size={26} />}
              <div className="grow">
                <strong>{uid ? userById(uid).name : 'Nobody'}</strong>
                <span>{p ? `Paged ${fmtClock(p.ts)}` : n === 1 ? 'Primary on-call' : n === 2 ? 'Secondary on-call' : 'Manager escalation'}</span>
              </div>
              {p && <Phone size={14} className="dim" />}
            </li>
          );
        })}
      </ol>

      {inc.isOpen && !inc.ackedAt && can(me, inc, 'ack') && (
        <button className="btn primary block" onClick={() => acknowledge(inc.id)}>
          Acknowledge page
        </button>
      )}
      {inc.isOpen && can(me, inc, 'page') && (
        <div className="page-row">
          <select className="input slim" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Person to page">
            <option value="">Page someone else</option>
            {TEAM.filter((u) => !u.disabled && u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="btn ghost" disabled={!target} onClick={() => { pageSomeone(inc, target); setTarget(''); }}>Page</button>
        </div>
      )}
      <p className="hint">Timers are shortened for the demo ({SEVERITIES[inc.severity].esc}s for {SEVERITIES[inc.severity].label}). Production uses minutes.</p>
    </section>
  );
}
