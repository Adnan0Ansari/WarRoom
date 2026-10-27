import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Megaphone, FileText, CheckCircle2 } from 'lucide-react';
import { useIncidents, useNow } from '../store/hooks.js';
import { useStore } from '../store/useStore.js';
import { SEVERITIES, STATUSES, serviceName, userById } from '../lib/constants.js';
import { fmtElapsed } from '../lib/time.js';
import { can, myIncidentRoles } from '../lib/rbac.js';
import { setSeverity, setStatus } from '../lib/actions.js';
import SeverityBadge from '../components/SeverityBadge.jsx';
import Timeline from '../components/Timeline.jsx';
import Composer from '../components/Composer.jsx';
import RolesPanel from '../components/RolesPanel.jsx';
import EscalationPanel from '../components/EscalationPanel.jsx';
import RunbookEditor from '../components/RunbookEditor.jsx';
import StatusPublisher from '../components/StatusPublisher.jsx';
import PostmortemPanel from '../components/PostmortemPanel.jsx';

const TABS = [
  { id: 'runbook', label: 'Runbook', icon: BookOpen },
  { id: 'status', label: 'Status page', icon: Megaphone },
  { id: 'postmortem', label: 'Postmortem', icon: FileText },
];

export default function IncidentRoom() {
  const { id } = useParams();
  const me = useStore((s) => s.me);
  const incidents = useIncidents();
  const now = useNow();
  const [tab, setTab] = useState('runbook');
  const inc = incidents.find((i) => i.id === id);

  if (!inc) {
    return (
      <div className="page">
        <div className="panel glass empty-room">
          <h1 className="display">That room does not exist.</h1>
          <p className="lead">The incident may have been removed, or the link is wrong.</p>
          <Link className="btn primary" to="/">Back to incidents</Link>
        </div>
      </div>
    );
  }

  const roles = myIncidentRoles(me, inc);
  const canSev = can(me, inc, 'change_severity');
  const canStatus = can(me, inc, 'change_status');
  const elapsed = (inc.resolvedAt || now) - inc.createdAt;

  return (
    <div className="room">
      <header className="room-head glass" style={{ '--c': SEVERITIES[inc.severity].color }}>
        <div className="rh-main">
          <Link to="/" className="back"><ArrowLeft size={15} /> Incidents</Link>
          <div className="rh-title">
            <SeverityBadge id={inc.severity} withName />
            <h1>{inc.title}</h1>
          </div>
          <p className="meta">
            <span>{inc.code}</span>
            <span>{serviceName(inc.service)}</span>
            <span>declared by {userById(inc.createdBy).name}</span>
            {roles.length > 0 && <span className="you">you are {roles.join(' and ')}</span>}
          </p>
        </div>
        <div className="rh-side">
          <div className={`clock ${inc.isOpen ? 'live' : ''}`}>
            <span className="clock-n">{fmtElapsed(elapsed)}</span>
            <span className="hint">{inc.isOpen ? 'elapsed' : 'total duration'}</span>
          </div>
          <div className="rh-controls">
            <select className="input slim" value={inc.severity} disabled={!canSev || !inc.isOpen} onChange={(e) => setSeverity(inc, e.target.value)} aria-label="Severity">
              {Object.values(SEVERITIES).map((s) => <option key={s.id} value={s.id}>{s.label} {s.name}</option>)}
            </select>
            <div className="seg small" role="radiogroup" aria-label="Status">
              {STATUSES.filter((s) => s.id !== 'resolved').map((s) => (
                <button key={s.id} role="radio" aria-checked={inc.status === s.id} className={inc.status === s.id ? 'on' : ''} disabled={!canStatus} onClick={() => setStatus(inc.id, s.id)}>{s.label}</button>
              ))}
            </div>
            {inc.isOpen ? (
              <button className="btn sage" disabled={!canStatus} onClick={() => setStatus(inc.id, 'resolved')}><CheckCircle2 size={15} /> Resolve</button>
            ) : (
              <button className="btn ghost" disabled={!canStatus} onClick={() => setStatus(inc.id, 'investigating')}>Reopen</button>
            )}
          </div>
        </div>
      </header>

      <div className="room-grid">
        <div className="col left">
          <RolesPanel incident={inc} me={me} />
          <EscalationPanel incident={inc} me={me} />
          <section className="panel glass">
            <h3>Signals</h3>
            {inc.alerts.length === 0 && <p className="empty small">No monitoring alerts are attached.</p>}
            <ul className="alert-list">
              {[...inc.alerts].reverse().slice(0, 5).map((a) => (
                <li key={a.id}>
                  <div className="alert-item">
                    <span className={`dot ${a.state === 'resolved' ? 'ok' : 'warn'}`} />
                    <div className="grow"><strong>{a.name}</strong><span>{a.source}. {a.state}</span></div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="col center panel glass">
          <Timeline events={inc.events} meId={me.id} />
          <Composer incident={inc} me={me} />
        </section>

        <section className="col right panel glass">
          <div className="tabs" role="tablist">
            {TABS.map(({ id: t, label, icon: Icon }) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="tab-body" key={`${inc.id}-${tab}`}>
            {tab === 'runbook' && <RunbookEditor incident={inc} me={me} />}
            {tab === 'status' && <StatusPublisher incident={inc} me={me} />}
            {tab === 'postmortem' && <PostmortemPanel incident={inc} me={me} />}
          </div>
        </section>
      </div>
    </div>
  );
}
