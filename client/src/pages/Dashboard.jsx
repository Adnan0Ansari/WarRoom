import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronRight, Radio } from 'lucide-react';
import { useIncidents, useNow } from '../store/hooks.js';
import { useStore } from '../store/useStore.js';
import { getOnCall, serviceName, userById, SEVERITIES, STATUSES } from '../lib/constants.js';
import { fmtDuration, fmtAgo, fmtElapsed } from '../lib/time.js';
import { can } from '../lib/rbac.js';
import SeverityBadge from '../components/SeverityBadge.jsx';
import Avatar from '../components/Avatar.jsx';
import NewIncidentModal from '../components/NewIncidentModal.jsx';

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

export default function Dashboard() {
  const me = useStore((s) => s.me);
  const incidents = useIncidents();
  const now = useNow();
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('open');

  const open = incidents.filter((i) => i.isOpen);
  const resolved = incidents.filter((i) => !i.isOpen);
  const mtta = avg(incidents.filter((i) => i.ackedAt).map((i) => i.ackedAt - i.createdAt));
  const mttr = avg(resolved.map((i) => i.resolvedAt - i.createdAt));
  const oncall = getOnCall();
  const list = tab === 'open' ? open : resolved;
  const alerts = useMemo(
    () => incidents.flatMap((i) => i.alerts.map((a) => ({ ...a, inc: i }))).sort((a, b) => b.ts - a.ts).slice(0, 6),
    [incidents]
  );
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display">{greet}, {me.name.split(' ')[0]}.</h1>
          <p className="lead">
            {open.length === 0 ? 'Everything is calm. No incidents are open.' : `${open.length} incident${open.length === 1 ? ' is' : 's are'} open right now.`} {oncall[0].name} is on call.
          </p>
        </div>
        {can(me, null, 'declare') && (
          <button className="btn primary liquid-btn" onClick={() => setModal(true)}>
            <Plus size={17} /> Declare incident
          </button>
        )}
      </header>

      <div className="dash-grid">
        <section className="panel glass tall">
          <div className="panel-head">
            <div className="chips">
              <button className={`chip ${tab === 'open' ? 'on' : ''}`} onClick={() => setTab('open')}>Open <b>{open.length}</b></button>
              <button className={`chip ${tab === 'resolved' ? 'on' : ''}`} onClick={() => setTab('resolved')}>Resolved <b>{resolved.length}</b></button>
            </div>
          </div>
          {list.length === 0 && (
            <p className="empty">{tab === 'open' ? 'No open incidents. When monitoring fires or someone declares one, it shows up here.' : 'Resolved incidents will be listed here.'}</p>
          )}
          <ul className="inc-list">
            {list.map((i) => (
              <li key={i.id}>
                <Link to={`/incidents/${i.id}`} className="inc-row" style={{ '--c': SEVERITIES[i.severity].color }}>
                  <span className="inc-bar" />
                  <div className="grow">
                    <div className="inc-top">
                      <SeverityBadge id={i.severity} />
                      <span className="code">{i.code}</span>
                      <span className="status">{STATUSES.find((s) => s.id === i.status)?.label}</span>
                    </div>
                    <strong>{i.title}</strong>
                    <span className="meta">
                      <span>{serviceName(i.service)}</span>
                      <span>{i.isOpen ? `open for ${fmtElapsed(now - i.createdAt)}` : `resolved in ${fmtDuration(i.resolvedAt - i.createdAt)}`}</span>
                      <span>{fmtAgo(i.createdAt, now)}</span>
                    </span>
                  </div>
                  <div className="avatars">
                    {['commander', 'scribe', 'comms'].filter((r) => i.roles[r]).map((r) => <Avatar key={r} id={i.roles[r]} size={28} />)}
                  </div>
                  <ChevronRight size={18} className="dim" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="side">
          <section className="panel glass stats">
            <div>
              <span className="big">{mtta == null ? 'n/a' : fmtDuration(mtta)}</span>
              <span className="hint">average time to acknowledge</span>
            </div>
            <div>
              <span className="big">{mttr == null ? 'n/a' : fmtDuration(mttr)}</span>
              <span className="hint">average time to resolve</span>
            </div>
          </section>

          <section className="panel glass">
            <h3>On call this week</h3>
            <ul className="oncall-mini">
              {oncall.slice(0, 3).map((u, i) => (
                <li key={u.id}>
                  <Avatar id={u.id} size={32} />
                  <div className="grow"><strong>{u.name}</strong><span>{['Primary', 'Secondary', 'Manager'][i]}</span></div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel glass">
            <h3>Latest alerts</h3>
            {alerts.length === 0 && <p className="empty small">No alerts have come in.</p>}
            <ul className="alert-list">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to={`/incidents/${a.inc.id}`}>
                    <Radio size={14} className={a.state === 'resolved' ? 'ok' : 'warn'} />
                    <div className="grow"><strong>{a.name}</strong><span>{a.source}, {userById('webhook').name}, {fmtAgo(a.ts, now)}</span></div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {modal && <NewIncidentModal onClose={() => setModal(false)} />}
    </div>
  );
}
