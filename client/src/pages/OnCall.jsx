import { useState } from 'react';
import { TEAM, ROLE_LABEL, SEVERITIES, getOnCall } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { useStore } from '../store/useStore.js';
import Avatar from '../components/Avatar.jsx';

const WEEK = 604800000;
const POSITIONS = [1, 2, 3, 4, 5, 6];

export default function OnCall() {
  const team = useStore((s) => s.team); // subscribing makes this page redraw when the team changes
  const me = useStore((s) => s.me);
  const toast = useStore((s) => s.toast);
  const isAdmin = me.role === 'admin';
  const [phone, setPhone] = useState(me.phone || '');
  const [invite, setInvite] = useState({ name: '', email: '', title: '', role: 'responder' });
  const [error, setError] = useState('');

  const rot = team.filter((u) => u.oncall).length;
  const weeks = [0, 1, 2, 3].map((w) => ({ w, start: new Date(Math.floor(Date.now() / WEEK) * WEEK + w * WEEK), people: getOnCall(Date.now() + w * WEEK) }));

  const update = async (id, data) => {
    setError('');
    try {
      await api.patch(`/users/${id}`, data);
    } catch (e) {
      setError(e.message);
    }
  };

  const savePhone = async () => {
    try {
      const r = await api.patch('/auth/me', { phone });
      useStore.setState({ me: r.user });
      toast('info', 'Saved', phone ? 'Pages will also arrive as a text message.' : 'Pages will arrive by email only.');
    } catch (e) {
      setError(e.message);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/users', invite);
      setInvite({ name: '', email: '', title: '', role: 'responder' });
      toast('info', `${r.user.name} was added`, r.temporaryPassword ? `Temporary password: ${r.temporaryPassword}` : undefined);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display">On-call and team</h1>
          <p className="lead">{rot} {rot === 1 ? 'person rotates' : 'people rotate'} weekly. Pages go to the primary first, then climb the ladder if nobody acknowledges.</p>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="two-col">
        <div className="stack">
          <section className="panel glass">
            <h3>Next four weeks</h3>
            <table className="table">
              <thead><tr><th>Week of</th><th>Primary</th><th>Secondary</th><th>Manager</th></tr></thead>
              <tbody>
                {weeks.map(({ w, start, people }) => (
                  <tr key={w} className={w === 0 ? 'now' : ''}>
                    <td>{start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{w === 0 && <em> now</em>}</td>
                    {[0, 1, 2].map((i) => <td key={i}>{people[i] ? <span className="who"><Avatar id={people[i].id} size={24} />{people[i].name}</span> : 'None'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="gap-top">Escalation policy</h3>
            <table className="table">
              <thead><tr><th>Severity</th><th>Wait before paging the next person</th></tr></thead>
              <tbody>
                {Object.values(SEVERITIES).map((s) => (
                  <tr key={s.id}><td><span className="sev" style={{ '--c': s.color }}><i />{s.label}</span></td><td>{s.esc >= 120 ? `${Math.round(s.esc / 60)} minutes` : `${s.esc} seconds`}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Set by ESC_SECONDS on the server. Timers run in Redis, so they survive restarts.</p>
          </section>

          <section className="panel glass">
            <h3>Your phone number</h3>
            <p className="hint">Pages always go to your email. Add a number to get a text message too.</p>
            <div className="sub-form">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550123" aria-label="Phone number" />
              <button className="btn ghost" onClick={savePhone}>Save</button>
            </div>
          </section>
        </div>

        <section className="panel glass">
          <h3>Team and permissions</h3>
          <ul className="people-list">
            {team.map((u) => (
              <li key={u.id} className={u.disabled ? 'off' : ''}>
                <Avatar id={u.id} size={38} />
                <div className="grow"><strong>{u.name}{u.disabled ? ' (disabled)' : ''}</strong><span>{u.title || u.email}</span></div>
                {isAdmin && u.id !== me.id ? (
                  <div className="admin-ctl">
                    <select className="input slim" value={u.role} aria-label={`Role for ${u.name}`} onChange={(e) => update(u.id, { role: e.target.value })}>
                      {['admin', 'responder', 'viewer'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <select className="input slim" value={u.oncall || ''} aria-label={`On-call seat for ${u.name}`} onChange={(e) => update(u.id, { oncall: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Not on call</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>Seat {p}</option>)}
                    </select>
                    <button className="btn ghost sm" onClick={() => update(u.id, { disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>
                  </div>
                ) : (
                  <span className="pill">{ROLE_LABEL[u.role]}{u.oncall ? `, seat ${u.oncall}` : ''}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">Admins can do everything. Responders can post and edit runbooks. Viewers read only. Inside one incident, the commander, scribe and communications roles add permissions for that incident alone. The server enforces all of this.</p>

          {isAdmin && (
            <form className="form invite" onSubmit={add}>
              <h3>Add a teammate</h3>
              <div className="row2">
                <input className="input" placeholder="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required aria-label="Full name" />
                <input className="input" type="email" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required aria-label="Email" />
              </div>
              <div className="row2">
                <input className="input" placeholder="Job title" value={invite.title} onChange={(e) => setInvite({ ...invite, title: e.target.value })} aria-label="Job title" />
                <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} aria-label="Role">
                  {['responder', 'viewer', 'admin'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <button className="btn primary" type="submit">Add teammate</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
