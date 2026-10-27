import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, ListChecks, Gavel, Radio, Bell, CheckCircle2, Shield, AlertTriangle, Activity, Megaphone } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { fmtClock } from '../lib/time.js';
import { SEVERITIES, STATUSES, INCIDENT_ROLES, userById, serviceName } from '../lib/constants.js';

const FILTERS = [
  ['all', 'Everything'],
  ['chat', 'Conversation'],
  ['record', 'Actions and decisions'],
  ['signals', 'Alerts and paging'],
];

const RECORD = ['action.logged', 'decision.logged', 'incident.severity_changed', 'incident.status_changed', 'role.assigned', 'statuspage.updated'];
const kindOf = (e) => (e.type === 'message.posted' ? 'chat' : RECORD.includes(e.type) ? 'record' : 'signals');

function describe(e) {
  const q = e.payload || {};
  const who = userById(e.actor).name;
  switch (e.type) {
    case 'incident.created':
      return { icon: Flame, tone: 'sev', title: `${who} declared the incident`, text: `${q.title} on ${serviceName(q.service)}` };
    case 'action.logged':
      return { icon: ListChecks, tone: 'tide', title: `Action by ${who}`, text: q.text };
    case 'decision.logged':
      return { icon: Gavel, tone: 'clay', title: `Decision by ${who}`, text: q.text };
    case 'alert.received':
      return { icon: Radio, tone: q.state === 'resolved' ? 'sage' : 'sev', title: `${q.source} alert ${q.state}`, text: `${q.name}${q.detail ? `. ${q.detail}` : ''}` };
    case 'escalation.paged':
      return { icon: Bell, tone: 'clay', title: q.manual ? `${who} paged ${userById(q.userId).name}` : `Paged ${userById(q.userId).name}`, text: q.manual ? 'Sent by SMS and email.' : `Escalation level ${q.level}. Sent by SMS and email.` };
    case 'escalation.acked':
      return { icon: CheckCircle2, tone: 'sage', title: `${who} acknowledged`, text: 'Escalation stopped.' };
    case 'role.assigned':
      return { icon: Shield, tone: 'tide', title: 'Role assigned', text: `${userById(q.userId).name} is ${INCIDENT_ROLES.find((r) => r.id === q.role)?.label.toLowerCase()}${q.auto ? ' (automatic)' : ` (set by ${who})`}` };
    case 'incident.severity_changed':
      return { icon: AlertTriangle, tone: 'sev', title: `${who} changed severity`, text: `${SEVERITIES[q.from]?.label} to ${SEVERITIES[q.to]?.label}` };
    case 'incident.status_changed':
      return { icon: Activity, tone: q.to === 'resolved' ? 'sage' : 'tide', title: `${who} changed status`, text: STATUSES.find((s) => s.id === q.to)?.label };
    case 'statuspage.updated':
      return { icon: Megaphone, tone: 'tide', title: `${who} posted to the status page`, text: q.text };
    default:
      return { icon: Activity, tone: 'tide', title: e.type, text: '' };
  }
}

export default function Timeline({ events, meId }) {
  const [filter, setFilter] = useState('all');
  const box = useRef(null);
  const stick = useRef(true);
  const shown = useMemo(() => events.filter((e) => filter === 'all' || kindOf(e) === filter), [events, filter]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <div className="timeline">
      <div className="chips" role="tablist" aria-label="Filter timeline">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div
        className="tl-scroll"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {shown.length === 0 && <p className="empty">Nothing here yet. Messages, actions and decisions appear as they happen.</p>}
        {shown.map((e) => {
          if (e.type === 'message.posted') {
            const mine = e.actor === meId;
            return (
              <div className={`tl-msg ${mine ? 'mine' : ''}`} key={e.id}>
                <Avatar id={e.actor} size={28} />
                <div className="bubble">
                  <header>
                    <strong>{userById(e.actor).name}</strong>
                    <time>{fmtClock(e.ts)}</time>
                  </header>
                  <p>{e.payload.text}</p>
                </div>
              </div>
            );
          }
          const d = describe(e);
          const Icon = d.icon;
          return (
            <div className={`tl-event ${d.tone}`} key={e.id}>
              <time>{fmtClock(e.ts)}</time>
              <span className="tl-ico"><Icon size={14} /></span>
              <div>
                <strong>{d.title}</strong>
                {d.text && <p>{d.text}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
