import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, RefreshCw, Pencil, Eye } from 'lucide-react';
import Markdown from './Markdown.jsx';
import { generatePostmortem } from '../lib/postmortem.js';
import { api } from '../lib/api.js';
import { can } from '../lib/rbac.js';
import { useStore } from '../store/useStore.js';

// The draft is generated from the timeline in the browser. Once someone edits it, the edited
// text is saved on the server so the whole team sees the same version.
export default function PostmortemPanel({ incident, me }) {
  const toast = useStore((s) => s.toast);
  const generated = useMemo(() => generatePostmortem(incident), [incident]);
  const [saved, setSaved] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState('');
  const timer = useRef(null);
  const editable = can(me, incident, 'edit_runbook');
  const text = saved ?? generated;

  useEffect(() => {
    let live = true;
    api.get(`/incidents/${incident.id}/postmortem`).then((r) => {
      if (!live) return;
      setSaved(r.text);
      setLoaded(true);
    }).catch(() => live && setLoaded(true));
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
  }, [incident.id]);

  const onEdit = (v) => {
    setSaved(v);
    setState('Saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.put(`/incidents/${incident.id}/postmortem`, { text: v }).then(() => setState('Saved')).catch((e) => setState(e.message));
    }, 800);
  };

  const regenerate = async () => {
    if (saved && !window.confirm('Replace the saved version with a fresh draft from the timeline?')) return;
    try {
      await api.del(`/incidents/${incident.id}/postmortem`);
      setSaved(null);
      setState('');
    } catch (e) {
      toast('info', 'Could not regenerate', e.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('info', 'Copied', 'Postmortem markdown is on your clipboard.');
    } catch {
      toast('info', 'Could not copy', 'Switch to edit mode and copy the text manually.');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${incident.code}-postmortem.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pm">
      <div className="rb-bar">
        <span className="hint">{!loaded ? 'Loading' : state || (saved ? 'Shared edited version' : 'Draft built from the timeline')}</span>
        <div className="tools">
          {editable && <button className="icon-btn" onClick={() => setEditing(!editing)} aria-label={editing ? 'Read' : 'Edit'} title={editing ? 'Read' : 'Edit'}>{editing ? <Eye size={15} /> : <Pencil size={15} />}</button>}
          {editable && <button className="icon-btn" onClick={regenerate} aria-label="Regenerate" title="Regenerate from timeline"><RefreshCw size={15} /></button>}
          <button className="icon-btn" onClick={copy} aria-label="Copy markdown" title="Copy markdown"><Copy size={15} /></button>
          <button className="icon-btn" onClick={download} aria-label="Download" title="Download .md"><Download size={15} /></button>
        </div>
      </div>
      {editing && editable ? (
        <textarea className="rb-text" value={text} onChange={(e) => onEdit(e.target.value)} spellCheck={false} aria-label="Postmortem markdown" />
      ) : (
        <div className="rb-read"><Markdown text={text} /></div>
      )}
    </div>
  );
}
