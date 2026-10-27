import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ROLE_LABEL } from '../lib/constants.js';
import { useStore } from '../store/useStore.js';

export default function Login() {
  const me = useStore((s) => s.me);
  const login = useStore((s) => s.login);
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/config', { auth: false }).then(setCfg).catch((e) => setCfg({ offline: e.message }));
  }, []);

  if (me) return <Navigate to="/" replace />;

  const submit = async (e, creds = { email, password }) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(creds.email, creds.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const demo = cfg?.demo?.enabled ? cfg.demo : null;

  return (
    <div className="login">
      <div className="login-card glass">
        <div>
          <h1 className="display">Step into the room.</h1>
          <p className="lead">Sign in to join live incidents, edit runbooks with your team and keep the record straight.</p>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {cfg?.offline && <p className="error" role="alert">{cfg.offline}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
        </form>

        {demo && (
          <div className="demo">
            <p className="hint">Demo accounts. Same password for all of them, shown only while SEED_DEMO is on. Use a private window to be a second person.</p>
            <div className="people">
              {demo.accounts.map((u) => (
                <button key={u.id} className="person" disabled={busy} onClick={() => submit(null, { email: u.email, password: demo.password })}>
                  <span className="grow">
                    <strong>{u.name}</strong>
                    <em>{u.title}</em>
                  </span>
                  <span className="pill">{ROLE_LABEL[u.role]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
