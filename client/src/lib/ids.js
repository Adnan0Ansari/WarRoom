export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Short human-friendly code derived from the id, e.g. INC-4821
export function codeFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 'INC-' + (1000 + (h % 9000));
}
