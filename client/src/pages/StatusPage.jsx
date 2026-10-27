import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../lib/api.js';
import { STATUSES } from '../lib/constants.js';
import { fmtDateTime } from '../lib/time.js';

const LABEL = { ok: 'Operational', degraded: 'Degraded performance', major: 'Major outage' };
const stateLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;

// Public: no sign-in, no team data. It polls, and also listens on the open /public socket
// namespace so it refreshes the moment an incident changes.
export default function StatusPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get('/public/status', { auth: false }));
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const s = io('/public');
    s.on('status:changed', load);
    return () => {
      clearInterval(t);
      s.disconnect();
    };
  }, [load]);

  const subscribe = async (e) => {
    e.preventDefault();
    try {
      await api.post('/public/subscribe', { email }, { auth: false });
      setMsg({ ok: true, text: 'You are subscribed. We will email you when an incident starts or changes.' });
      setEmail('');
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const days = data?.historyDays || 45;
  const overall = data?.overall || 'ok';

  return (
    <div className="sp">
      <header className="sp-head">
        <span className="sp-brand"><i /> Tidewater status</span>
      </header>

      {loadError && !data && <p className="error" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="hint">Loading the latest status.</p>}

      {data && (
        <>
          <section className={`sp-banner glass ${overall}`}>
            <h1 className="display">{overall === 'ok' ? 'All systems are running normally.' : overall === 'degraded' ? 'Some systems are slower than usual.' : 'We are having a major outage.'}</h1>
            <p className="lead">{data.active.length ? `${data.active.length} active incident${data.active.length === 1 ? '' : 's'}. Updates appear below as soon as we post them.` : 'Nothing needs your attention.'}</p>
          </section>

          {data.active.map((i) => (
            <section className="sp-inc glass" key={i.code}>
              <h2>{i.title}</h2>
              <p className="hint">Affects {i.service}. Started {fmtDateTime(i.startedAt)}.</p>
              <ul className="updates">
                {i.updates.length === 0 && <li><strong>Investigating</strong><p>We are aware of the issue and are looking into it. The next update will be posted shortly.</p></li>}
                {[...i.updates].reverse().map((u, k) => (
                  <li key={k}><strong>{stateLabel(u.state)}</strong><p>{u.text}</p><span className="hint">{fmtDateTime(u.ts)}</span></li>
                ))}
              </ul>
            </section>
          ))}

          <section className="sp-services glass">
            {data.services.map((s) => (
              <div className="sp-svc" key={s.id}>
                <div className="sp-row"><strong>{s.name}</strong><span className={`state ${s.state}`}>{LABEL[s.state]}</span></div>
                <div className="bars" role="img" aria-label={`${days}-day history for ${s.name}`} style={{ gridTemplateColumns: `repeat(${s.history.length}, 1fr)` }}>
                  {s.history.map((b, k) => <i key={k} className={b} />)}
                </div>
                <div className="bars-foot"><span>{days} days ago</span><span>Today</span></div>
              </div>
            ))}
          </section>

          <section className="sp-past glass">
            <h2>Past incidents</h2>
            {data.recent.length === 0 && <p className="empty small">No incidents in the last 14 days.</p>}
            {data.recent.map((i) => (
              <div className="past" key={i.code}>
                <strong>{i.title}</strong>
                <span className="hint">Resolved {fmtDateTime(i.resolvedAt)}</span>
                {i.updates.length > 0 && <p>{i.updates[i.updates.length - 1].text}</p>}
              </div>
            ))}
          </section>
        </>
      )}

      <section className="sp-sub glass">
        <h2>Get updates by email</h2>
        <form onSubmit={subscribe} className="sub-form">
          <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} placeholder="you@company.com" aria-label="Email address" required />
          <button className="btn primary" type="submit">Subscribe</button>
        </form>
        {msg && <p className={msg.ok ? 'hint ok-text' : 'error'} role="status">{msg.text}</p>}
      </section>
    </div>
  );
}
