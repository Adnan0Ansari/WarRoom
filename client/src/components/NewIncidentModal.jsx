import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import { SERVICES, SEVERITIES, getOnCall } from '../lib/constants.js';
import { declareIncident } from '../lib/actions.js';

export default function NewIncidentModal({ onClose }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [service, setService] = useState(SERVICES[0].id);
  const [severity, setSeverity] = useState('sev2');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const oncall = getOnCall();

  const submit = async (e) => {
    e.preventDefault();
    if (title.trim().length < 4) return setError('Give the incident a short title of at least 4 characters.');
    setBusy(true);
    const id = await declareIncident({ title: title.trim(), service, severity, summary: summary.trim() });
    setBusy(false);
    if (!id) return; // the store already explained why
    onClose();
    navigate(`/incidents/${id}`);
  };

  return (
    <Modal title="Declare an incident" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>What is happening?</span>
          <input className="input" autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} placeholder="Checkout returns 502 for some customers" maxLength={120} />
        </label>
        <div className="row2">
          <label className="field">
            <span>Affected service</span>
            <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
              {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Severity</span>
            <div className="seg" role="radiogroup" aria-label="Severity">
              {Object.values(SEVERITIES).map((s) => (
                <button type="button" key={s.id} role="radio" aria-checked={severity === s.id} className={severity === s.id ? 'on' : ''} style={{ '--c': s.color }} onClick={() => setSeverity(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="hint">{SEVERITIES[severity].name}: {SEVERITIES[severity].hint}.</p>
        <label className="field">
          <span>Details <em>(optional)</em></span>
          <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What you know so far, who is affected, how you found out" />
        </label>
        <div className="note glass-inset">
          Declaring pages <strong>{oncall[0]?.name || 'nobody (set up the rotation first)'}</strong> as commander and assigns {oncall[1]?.name || oncall[0]?.name || 'nobody'} as scribe. Communications goes to whoever on the team has the comms skill.
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Declaring' : 'Declare and open room'}</button>
        </div>
      </form>
    </Modal>
  );
}
