const WEEK = 604800000;

// Everyone with an `oncall` position joins the rotation, which shifts one seat each week.
export function rotation(users, now = Date.now()) {
  const rot = users.filter((u) => u.oncall && !u.disabled).sort((a, b) => a.oncall - b.oncall);
  if (!rot.length) return [];
  const week = Math.floor(now / WEEK);
  return rot.map((_, i) => rot[(week + i) % rot.length]);
}
