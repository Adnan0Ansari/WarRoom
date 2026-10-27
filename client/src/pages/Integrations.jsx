import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Zap, Copy, RefreshCw, Trash2, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useStore } from '../store/useStore.js';
import { fmtClock } from '../lib/time.js';

const SOURCE_LABEL = { prometheus: 'Prometheus Alertmanager', datadog: 'Datadog', custom: 'Custom JSON' };

const SAMPLES = {
  prometheus: { status: 'firing', alerts: [{ status: 'firing', fingerprint: 'a91c7b', labels: { alertname: 'HighErrorRate', service: 'api-gateway', severity: 'critical' }, annotations: { summary: '5xx rate above 8% for 5 minutes on api-gateway' } }] },
  datadog: { title: 'Replication lag on primary database', alert_type: 'error', alert_id: 'dd-48121', tags: 'service:database,env:prod', body: 'Replica lag has been above 45s for 10 minutes.' },
  custom: { id: 'cron-77', service: 'notifications', severity: 'sev3', title: 'Email queue is backing up', message: 'Queue depth 12,400 and rising. Workers at 100% CPU.', state: 'firing' },
};
const pretty = (o) => JSON.stringify(o, null, 2);

export default function Integrations() {
  const me = useStore((s) => s.me);
  const config = useStore((s) => s.config);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [selected, setSelected] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [name, setName] = useState('');
  const [source, setSource] = useState('prometheus');
  const isAdmin = me.role === 'admin';

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [a, b] = await Promise.all([api.get('/integrations'), api.get('/integrations/deliveries')]);
      setItems(a.integrations);
      setDeliveries(b.deliveries);
      setSelected((cur) => cur || a.integrations[0]?.id || '');
    } catch (e) {
      setError(e.message);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const current = items?.find((i) => i.id === selected);
  useEffect(() => {
    if (current) setBody(pretty(SAMPLES[current.source]));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="panel glass empty-room">
          <h1 className="display">Integrations are for admins.</h1>
          <p className="lead">Webhook URLs contain secret tokens, so only admins can see them. Ask an admin to connect your monitoring tools.</p>
        </div>
      </div>
    );
  }

  const urlFor = (i) => `${config?.apiUrl || window.location.origin}/api/webhooks/${i.source}/${i.token}`;
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('info', 'Copied', 'Webhook URL copied.'), () => toast('info', 'Could not copy', 'Select the text and copy it manually.'));

  const send = async () => {
    if (!current) return;
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      return setError(`That is not valid JSON: ${e.message}`);
    }
    setError('');
    try {
      // A real request to the real endpoint, exactly like a monitoring tool would send.
      const res = await fetch(`/api/webhooks/${current.source}/${current.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'The server rejected the webhook.');
      else setResults(data.results);
    } catch {
      setError('Cannot reach the server.');
    }
    load();
  };

  const recovery = () => {
    try {
      const p = JSON.parse(body);
      const next = current.source === 'prometheus' ? { ...p, status: 'resolved', alerts: (p.alerts || []).map((a) => ({ ...a, status: 'resolved' })) } : current.source === 'datadog' ? { ...p, alert_type: 'success' } : { ...p, state: 'resolved' };
      setBody(pretty(next));
    } catch {
      setError('Fix the JSON first.');
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const r = await api.post('/integrations', { name: name.trim(), source });
      setName('');
      setSelected(r.integration.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const patch = (id, data) => api.patch(`/integrations/${id}`, data).then(load).catch((e) => setError(e.message));
  const remove = async (i) => {
    if (!window.confirm(`Delete "${i.name}"? Its URL will stop working immediately.`)) return;
    await api.del(`/integrations/${i.id}`).catch((e) => setError(e.message));
    setSelected('');
    load();
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display">Integrations</h1>
          <p className="lead">Point your monitoring tools at these URLs. A firing alert declares an incident, or attaches to the one already open for that service. Repeats are deduplicated.</p>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="two-col">
        <div className="stack">
          <section className="panel glass">
            <h3>Webhook endpoints</h3>
            {!items && <p className="empty small">Loading.</p>}
            <ul className="integ-list">
              {(items || []).map((i) => (
                <li key={i.id} className={`${i.id === selected ? 'sel' : ''} ${i.enabled ? '' : 'off'}`}>
                  <button className="integ-main" onClick={() => setSelected(i.id)}>
                    <strong>{i.name}</strong>
                    <span className="hint">{SOURCE_LABEL[i.source]}. {i.lastUsedAt ? `Last used ${new Date(i.lastUsedAt).toLocaleString()}` : 'Never used'}</span>
                  </button>
                  <div className="tools">
                    <button className="icon-btn" aria-label="Copy URL" title="Copy URL" onClick={() => copy(urlFor(i))}><Copy size={14} /></button>
                    <button className="icon-btn" aria-label="Rotate token" title="Rotate token" onClick={() => window.confirm('Rotate the token? The old URL stops working.') && patch(i.id, { rotate: true })}><RefreshCw size={14} /></button>
                    <button className="icon-btn" aria-label={i.enabled ? 'Disable' : 'Enable'} title={i.enabled ? 'Disable' : 'Enable'} onClick={() => patch(i.id, { enabled: !i.enabled })}><Zap size={14} /></button>
                    <button className="icon-btn" aria-label="Delete" title="Delete" onClick={() => remove(i)}><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
            {current && <div className="endpoint glass-inset"><code>POST {urlFor(current)}</code></div>}
            <form className="sub-form" onSubmit={create}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Production Datadog" aria-label="Integration name" maxLength={60} />
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
                {Object.entries(SOURCE_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
              <button className="btn ghost" type="submit"><Plus size={15} /> Add</button>
            </form>
          </section>

          <section className="panel glass">
            <h3>Send a test alert</h3>
            {!current && <p className="empty small">Create or select an endpoint first.</p>}
            {current && (
              <>
                <label className="field">
                  <span>Payload for {SOURCE_LABEL[current.source]}</span>
                  <textarea className="input code" rows={12} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
                </label>
                <div className="modal-actions left">
                  <button className="btn primary" onClick={send} disabled={!current.enabled}><Send size={15} /> Send webhook</button>
                  <button className="btn ghost" onClick={recovery}>Make it a recovery</button>
                  <button className="btn ghost" onClick={() => setBody(pretty(SAMPLES[current.source]))}>Reset sample</button>
                </div>
                {!current.enabled && <p className="hint">This endpoint is disabled.</p>}
                {results && (
                  <ul className="log">
                    {results.map((r, i) => (
                      <li key={i} className={r.action}>
                        <Zap size={14} />
                        <div className="grow"><strong>{r.action === 'created' ? 'Incident declared' : r.action === 'attached' ? 'Attached' : 'Ignored'}</strong><p>{r.text}</p></div>
                        {r.incidentId && <Link className="btn ghost sm" to={`/incidents/${r.incidentId}`}>Open</Link>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>

        <section className="panel glass">
          <div className="panel-head row-between"><h3>Delivery log</h3><button className="icon-btn" aria-label="Refresh" onClick={load}><RefreshCw size={15} /></button></div>
          {deliveries.length === 0 && <p className="empty">Nothing has arrived yet. Send a test alert, or point a real monitor at an endpoint.</p>}
          <ul className="log">
            {deliveries.map((d) => (
              <li key={d.id} className={d.status === 'ok' ? 'attached' : 'created'}>
                <Zap size={14} />
                <div className="grow">
                  <strong>{d.integration}</strong>
                  {d.status === 'ok' ? (d.results || []).map((r, i) => <p key={i}>{r.text}</p>) : <p>Rejected: {d.error}</p>}
                  <span className="hint">{fmtClock(new Date(d.ts).getTime())}, {d.bytes || 0} bytes</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
