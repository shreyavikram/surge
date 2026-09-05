import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config-schema.js';
import { minimalContext } from './fixtures/minimal-context.js';

describe('validateConfig', () => {
  it('accepts the minimal fixture', () => {
    expect(validateConfig(minimalContext())).toEqual([]);
  });
  it('reports a commodity with no baseline source', () => {
    const ctx = minimalContext();
    ctx.commodities['eggs']!.baseline.source = '';
    expect(validateConfig(ctx)).toContain('commodities.eggs.baseline.source is required');
  });
  it('reports a demand matrix that is not square', () => {
    const ctx = minimalContext();
    ctx.demand.marshallian = [[-0.24]];
    expect(validateConfig(ctx).some((p) => p.includes('demand.marshallian'))).toBe(true);
  });
  it('reports a commodity whose group is not a demand item', () => {
    const ctx = minimalContext();
    ctx.commodities['eggs']!.group = 'nope';
    expect(validateConfig(ctx)).toContain('commodities.eggs.group "nope" is not a demand item');
  });
  it('reports a commodity input that is not a configured input', () => {
    const ctx = minimalContext();
    ctx.commodities['eggs']!.inputs = [{ input: 'corn', costShare: 0.1, source: 'x' }];
    expect(validateConfig(ctx)).toContain('commodities.eggs.inputs.corn unknown input');
  });
});
