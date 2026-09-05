import type { ReactNode } from 'react';

export type ChipKind = 'measured' | 'modeled' | 'seed' | 'observed';

/** Provenance tag. Every displayed number should carry one. Tooltip = source. */
export function Chip({ kind, children, title }: { kind: ChipKind; children: ReactNode; title?: string }) {
  return (
    <span className={`chip ${kind}`} title={title}>
      {children}
    </span>
  );
}
