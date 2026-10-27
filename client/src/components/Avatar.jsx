import { userById } from '../lib/constants.js';

export default function Avatar({ id, size = 30 }) {
  const u = userById(id);
  const initials = u.name.split(' ').map((s) => s[0]).slice(0, 2).join('');
  return (
    <span className="avatar" title={u.name} style={{ width: size, height: size, fontSize: size * 0.38, '--h': u.hue }}>
      {initials}
    </span>
  );
}
