import { useState } from 'react';
import { Send } from 'lucide-react';
import { postMessage, logAction, logDecision } from '../lib/actions.js';
import { can } from '../lib/rbac.js';

const MODES = [
  { id: 'message', label: 'Message', perm: 'message', run: postMessage, ph: 'Share what you are seeing. Enter to send.' },
  { id: 'action', label: 'Action taken', perm: 'log_action', run: logAction, ph: 'Record something you did, e.g. "Rolled back deploy 4821".' },
  { id: 'decision', label: 'Decision', perm: 'log_decision', run: logDecision, ph: 'Record a decision and who made it.' },
];

export default function Composer({ incident, me }) {
  const [mode, setMode] = useState('message');
  const [text, setText] = useState('');
  const current = MODES.find((m) => m.id === mode);
  const allowed = can(me, incident, current.perm);
  const open = incident.isOpen;

  const send = async () => {
    const v = text.trim();
    if (!v || !allowed) return;
    const ok = await current.run(incident.id, v);
    if (ok) setText('');
  };

  return (
    <div className="composer glass-inset">
      <div className="seg small" role="radiogroup" aria-label="Entry type">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} disabled={!can(me, incident, m.perm)} title={can(me, incident, m.perm) ? '' : 'You need the commander or scribe role for this'}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="composer-row">
        <textarea
          className="input"
          rows={2}
          value={text}
          disabled={!allowed}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={allowed ? (open ? current.ph : 'This incident is resolved. You can still add notes.') : 'You can read this room but not post. Ask the commander to give you a role.'}
        />
        <button className="btn primary round" onClick={send} disabled={!allowed || !text.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
