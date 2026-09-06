import { useRef, useState } from 'react';
import { GLOSSARY } from '../glossary.js';

/** Small ⓘ that reveals a plain-language definition on hover or click. The popover is positioned in the viewport
 * so it never overflows a scrolling panel. */
export function Info({ term, inline = true }: { term: keyof typeof GLOSSARY | string; inline?: boolean }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const g = GLOSSARY[term];
  if (!g) return null;
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = 280, height = 120;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = r.bottom + 6 + height > window.innerHeight ? Math.max(8, r.top - height - 6) : r.bottom + 6;
    setPos({ left, top });
  };
  return (
    <span className={`info ${inline ? 'inline' : ''}`} onMouseEnter={open} onMouseLeave={() => setPos(null)}>
      <button ref={btn} type="button" className="info-btn" aria-label={`About ${g.title}`} onClick={(e) => { e.stopPropagation(); pos ? setPos(null) : open(); }}>i</button>
      {pos && (
        <span className="info-pop" role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top }}>
          <strong>{g.title}</strong>
          <span>{g.text}</span>
        </span>
      )}
    </span>
  );
}
