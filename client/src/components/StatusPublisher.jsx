import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { STATUSES, userById } from '../lib/constants.js';
import { publishStatus } from '../lib/actions.js';
import { can } from '../lib/rbac.js';
import { fmtDateTime } from '../lib/time.js';
import { useStore } from '../store/useStore.js';

export default function StatusPublisher({ incident, me }) {
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [state, setState] = useState(incident.status);
  const allowed = can(me, incident, 'publish_status');

  const publish = async () => {
    if (!text.trim()) return;
    const n = await publishStatus(incident.id, text.trim(), state);
    if (n === null) return;
    toast('info', 'Published to the status page', n ? `Emailing ${n} subscriber${n === 1 ? '' : 's'}.` : 'No subscribers yet.');
    setText('');
  };

  return (
    <div className="pane-pad">
      <p className="lead">What customers see on the public status page.</p>
      {allowed ? (
        <div className="form">
          <div className="seg small" role="radiogroup" aria-label="Update state">
            {STATUSES.map((s) => (
              <button key={s.id} role="radio" aria-checked={state === s.id} className={state === s.id ? 'on' : ''} onClick={() => setState(s.id)}>{s.label}</button>
            ))}
          </div>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say what is affected, what you are doing, and when you will update next. Avoid internal jargon." />
          <button className="btn primary" onClick={publish} disabled={!text.trim()}><Megaphone size={15} /> Publish update</button>
        </div>
      ) : (
        <p className="hint">Only the communications lead, the commander or an admin can publish.</p>
      )}
      <h4 className="sub">Published so far</h4>
      {incident.statusUpdates.length === 0 && <p className="empty small">No public updates yet. Customers see "Investigating" until you post one.</p>}
      <ul className="updates">
        {[...incident.statusUpdates].reverse().map((u, i) => (
          <li key={i}>
            <strong>{STATUSES.find((s) => s.id === u.state)?.label}</strong>
            <p>{u.text}</p>
            <span className="hint">{userById(u.by).name} at {fmtDateTime(u.ts)}. {u.notified} subscriber{u.notified === 1 ? '' : 's'} emailed.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
