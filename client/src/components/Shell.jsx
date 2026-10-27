import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { Activity, Webhook, Users, Globe, LogOut } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import Avatar from './Avatar.jsx';

const NAV = [
  { to: '/', icon: Activity, label: 'Incidents', end: true },
  { to: '/integrations', icon: Webhook, label: 'Integrations' },
  { to: '/oncall', icon: Users, label: 'On-call and team' },
];

export function Splash({ text = 'Loading' }) {
  return (
    <div className="splash" role="status">
      <span className="splash-drop" />
      <p>{text}</p>
    </div>
  );
}

export default function Shell() {
  const me = useStore((s) => s.me);
  const ready = useStore((s) => s.ready);
  const connected = useStore((s) => s.connected);
  const logout = useStore((s) => s.logout);
  if (!me) return <Navigate to="/login" replace />;
  if (!ready) return <Splash text="Opening the war-room" />;
  return (
    <div className="shell">
      <nav className="dock glass" aria-label="Main">
        <div className="drop-logo" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <defs>
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b" />
                <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
              </filter>
            </defs>
            <g filter="url(#goo)">
              <circle className="d1" cx="17" cy="19" r="9" />
              <circle className="d2" cx="26" cy="22" r="6" />
            </g>
          </svg>
        </div>
        <div className="dock-links">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className="dock-btn" aria-label={label}>
              <Icon size={19} />
              <span className="tip">{label}</span>
            </NavLink>
          ))}
          <a className="dock-btn" href="/status" target="_blank" rel="noreferrer" aria-label="Public status page">
            <Globe size={19} />
            <span className="tip">Public status page</span>
          </a>
        </div>
        <div className="dock-foot">
          <span className={`conn ${connected ? 'on' : 'off'}`} title={connected ? 'Live' : 'Reconnecting'} />
          <span className="dock-btn" aria-label={me.name}>
            <Avatar id={me.id} size={30} />
            <span className="tip">{me.name}</span>
          </span>
          <button className="dock-btn dim" aria-label="Sign out" onClick={logout}>
            <LogOut size={17} />
            <span className="tip">Sign out</span>
          </button>
        </div>
      </nav>
      {!connected && <div className="offline-banner glass" role="status">Connection lost. Reconnecting, and anything you missed will catch up.</div>}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
