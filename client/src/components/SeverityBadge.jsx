import { SEVERITIES } from '../lib/constants.js';

export default function SeverityBadge({ id, withName = false }) {
  const s = SEVERITIES[id];
  if (!s) return null;
  return (
    <span className="sev" style={{ '--c': s.color }}>
      <i />
      {s.label}
      {withName && <em>{s.name}</em>}
    </span>
  );
}
