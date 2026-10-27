import { Bell, Info, X } from 'lucide-react';
import { useStore } from '../store/useStore.js';

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className={`toast glass ${t.kind}`} key={t.id}>
          <span className="t-ico">{t.kind === 'page' ? <Bell size={16} /> : <Info size={16} />}</span>
          <div>
            <strong>{t.title}</strong>
            {t.body && <p>{t.body}</p>}
          </div>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
