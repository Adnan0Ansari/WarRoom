import { useEffect, useRef, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import Markdown from './Markdown.jsx';
import Avatar from './Avatar.jsx';
import { RunbookProvider, applyTextDiff, shiftThroughDelta, toggleChecklistLine } from '../lib/collab.js';
import { getSocket } from '../lib/socket.js';
import { can } from '../lib/rbac.js';

const STATUS_TEXT = { connecting: 'Connecting', synced: 'Live', offline: 'Offline. Edits will sync when you reconnect.', error: 'Could not load the runbook' };

export default function RunbookEditor({ incident, me }) {
  const editable = can(me, incident, 'edit_runbook');
  const [text, setText] = useState('');
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [mode, setMode] = useState('preview');
  const prov = useRef(null);
  const area = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const p = new RunbookProvider(incident.id, me, socket);
    prov.current = p;
    setText(p.ytext.toString());

    const observer = (event, tr) => {
      if (tr.origin === 'local-edit') return;
      const next = p.ytext.toString();
      const ta = area.current;
      if (ta && document.activeElement === ta) {
        // Keep the caret where it was relative to the text, even if others type above it.
        const s = shiftThroughDelta(event.delta, ta.selectionStart);
        const e = shiftThroughDelta(event.delta, ta.selectionEnd);
        setText(next);
        requestAnimationFrame(() => ta.setSelectionRange(s, e));
      } else {
        setText(next);
      }
    };
    p.ytext.observe(observer);
    const offPeers = p.onPeers(setPeers);
    const offStatus = p.onStatus(setStatus);
    return () => {
      p.ytext.unobserve(observer);
      offPeers();
      offStatus();
      p.destroy();
      prov.current = null;
    };
  }, [incident.id, me]);

  const onChange = (e) => {
    const p = prov.current;
    if (!p) return;
    applyTextDiff(p.ytext, e.target.value);
    setText(p.ytext.toString());
  };

  const onToggle = (line) => {
    const p = prov.current;
    if (!p || !editable) return;
    toggleChecklistLine(p.ytext, line);
    setText(p.ytext.toString());
  };

  const done = (text.match(/- \[x\]/g) || []).length;
  const total = (text.match(/- \[( |x)\]/g) || []).length;

  return (
    <div className="runbook">
      <div className="rb-bar">
        <div className="peers" aria-label="People in this runbook">
          <span className={`live-dot ${status}`} title={STATUS_TEXT[status]} />
          <Avatar id={me.id} size={24} />
          {peers.map((p) => <Avatar key={p.id} id={p.id} size={24} />)}
          <span className="hint">{status === 'synced' ? (peers.length ? `${peers.length + 1} editing` : 'Live. Only you here.') : STATUS_TEXT[status]}</span>
        </div>
        <div className="seg small">
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}><Eye size={13} /> Read</button>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')} disabled={!editable}><Pencil size={13} /> Edit</button>
        </div>
      </div>
      {total > 0 && (
        <div className="progress" title={`${done} of ${total} steps done`}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      {mode === 'edit' && editable ? (
        <textarea ref={area} className="rb-text" value={text} onChange={onChange} spellCheck={false} aria-label="Runbook markdown" />
      ) : (
        <div className="rb-read">{text ? <Markdown text={text} onToggle={editable ? onToggle : undefined} /> : <p className="empty small">{status === 'error' ? STATUS_TEXT.error : 'Loading the runbook.'}</p>}</div>
      )}
      {!editable && <p className="hint pad">Read only. Responders and anyone with a role can edit.</p>}
    </div>
  );
}
