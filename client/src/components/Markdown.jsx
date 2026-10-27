// Small, safe markdown renderer (headings, checklists, bullets, numbers, bold, code).
// It builds React elements, never HTML strings, so there is nothing to sanitise.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return p;
  });
}

export default function Markdown({ text, onToggle }) {
  const out = [];
  text.split('\n').forEach((ln, i) => {
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) {
      const Tag = ['h2', 'h3', 'h4'][m[1].length - 1];
      out.push(<Tag key={i}>{inline(m[2])}</Tag>);
    } else if ((m = /^\s*- \[( |x)\]\s*(.*)$/.exec(ln))) {
      out.push(
        <label className="chk" key={i}>
          <input type="checkbox" checked={m[1] === 'x'} disabled={!onToggle} onChange={() => onToggle && onToggle(i)} />
          <span className={m[1] === 'x' ? 'done' : ''}>{inline(m[2])}</span>
        </label>
      );
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(ln))) {
      out.push(<div className="li" key={i}>{inline(m[1])}</div>);
    } else if ((m = /^\s*(\d+)\.\s+(.*)$/.exec(ln))) {
      out.push(<div className="li num" key={i} data-n={m[1]}>{inline(m[2])}</div>);
    } else if (!ln.trim()) {
      out.push(<div className="gap" key={i} />);
    } else {
      out.push(<p key={i}>{inline(ln)}</p>);
    }
  });
  return <div className="md">{out}</div>;
}
