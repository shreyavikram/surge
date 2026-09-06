import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '../glossary.js';

/** Small ⓘ that reveals a plain-language definition on hover or click. The popover renders into the page body,
 * is measured after it appears, and is clamped to the window on both axes, so it can never sit off screen. */
export function Info({ term, inline = true }: { term: keyof typeof GLOSSARY | string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const g = GLOSSARY[term];

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      const p = pop.current?.getBoundingClientRect();
      if (!r || !p) return;
      const w = p.width || 280, h = p.height || 120;
      const vw = window.innerWidth, vh = window.innerHeight;
      let left = r.left;
      if (left + w + 8 > vw) left = vw - w - 8;
      if (left < 8) left = 8;
      let top = r.bottom + 6;
      if (top + h + 8 > vh) top = r.top - h - 6;
      if (top < 8) top = Math.max(8, vh - h - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  if (!g) return null;
  return (
    <span className={`info ${inline ? 'inline' : ''}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button ref={btn} type="button" className="info-btn" aria-label={`About ${g.title}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>i</button>
      {open && createPortal(
        <span ref={pop} className="info-pop" role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <strong>{g.title}</strong>
          <span>{g.text}</span>
        </span>,
        document.body,
      )}
    </span>
  );
}
