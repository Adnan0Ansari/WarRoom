import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LiquidBackground from './components/LiquidBackground.jsx';
import Shell, { Splash } from './components/Shell.jsx';
import Toasts from './components/Toasts.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import IncidentRoom from './pages/IncidentRoom.jsx';
import Integrations from './pages/Integrations.jsx';
import OnCall from './pages/OnCall.jsx';
import StatusPage from './pages/StatusPage.jsx';
import { useNotifier } from './store/hooks.js';
import { useStore } from './store/useStore.js';

export default function App() {
  const booted = useStore((s) => s.booted);
  const restoreSession = useStore((s) => s.restoreSession);
  const { pathname } = useLocation();
  useNotifier();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Lets every glass surface catch light where the pointer is.
  useEffect(() => {
    const onMove = (e) => {
      const g = e.target.closest && e.target.closest('.glass');
      if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--mx', `${e.clientX - r.left}px`);
      g.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, []);

  // The public status page never needs a session, so it does not wait for one.
  const waiting = !booted && !pathname.startsWith('/status');

  return (
    <>
      <LiquidBackground />
      {waiting ? (
        <Splash text="Checking your session" />
      ) : (
        <Routes>
          <Route path="/status" element={<StatusPage />} />
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/incidents/:id" element={<IncidentRoom />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/oncall" element={<OnCall />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <Toasts />
    </>
  );
}
