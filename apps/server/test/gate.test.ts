import { describe, it, expect } from 'vitest';
import type { Threat } from '@surge/engine';
import { checkVetted, redactThreat } from '../src/gate.js';

const gatedThreat: Threat = {
  id: 't', name: 'HPAI', category: 'disease', kind: 'natural',
  location: { lat: 42, lng: -93, regionId: 'us-iowa' },
  commodities: [{ id: 'eggs', relevance: 1 }], severity: 1, start: '2026-09',
  source: { feed: 'APHIS', kind: 'archive' },
  gated: { county: 'Buena Vista', premises: 3 },
};

describe('gate', () => {
  it('recognizes a vetted cookie or header only when a key is configured', () => {
    expect(checkVetted('surge_vetted=secret', undefined, 'secret')).toBe(true);
    expect(checkVetted(undefined, 'secret', 'secret')).toBe(true);
    expect(checkVetted('surge_vetted=wrong', undefined, 'secret')).toBe(false);
    expect(checkVetted('surge_vetted=secret', undefined, undefined)).toBe(false); // no key set → nobody vetted
  });

  it('strips gated fields for the public and keeps them for the vetted', () => {
    expect(redactThreat(gatedThreat, false).gated).toBeUndefined();
    expect(redactThreat(gatedThreat, true).gated).toEqual({ county: 'Buena Vista', premises: 3 });
  });
});
