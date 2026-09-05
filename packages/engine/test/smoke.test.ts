import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('engine package', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});
