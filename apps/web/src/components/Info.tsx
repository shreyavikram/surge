import { useState } from 'react';
import { GLOSSARY } from '../glossary.js';

/** Small ⓘ that reveals a plain-language definition on hover or click. */
export function Info({ term, inline = true }: { term: keyof typeof GLOSSARY | string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[term];
  if (!g) return null;
  return (
    <span className={`info ${inline ? 'inline' : ''}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="info-btn" aria-label={`About ${g.title}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>i</button>
      {open && (
        <span className="info-pop" role="tooltip">
          <strong>{g.title}</strong>
          <span>{g.text}</span>
        </span>
      )}
    </span>
  );
}
