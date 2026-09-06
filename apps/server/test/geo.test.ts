import { describe, it, expect } from 'vitest';
import { stateAt, pointInRing, pointInPolygon, pointInGeometry } from '../src/geo.js';

describe('point in polygon', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  it('ray-casts a ring', () => {
    expect(pointInRing(square, 5, 5)).toBe(true);
    expect(pointInRing(square, 15, 5)).toBe(false);
    expect(pointInRing(square, -1, -1)).toBe(false);
  });
  it('respects holes and multipolygons', () => {
    expect(pointInPolygon([square, hole], 5, 5)).toBe(false);
    expect(pointInPolygon([square, hole], 2, 2)).toBe(true);
    const far = [[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]];
    expect(pointInGeometry({ type: 'MultiPolygon', coordinates: [[square], [far]] }, 105, 105)).toBe(true);
    expect(pointInGeometry({ type: 'MultiPolygon', coordinates: [[square], [far]] }, 50, 50)).toBe(false);
  });
});

describe('stateAt', () => {
  it('places a point in Kansas in KS and a point in the Gulf of Mexico in no state', () => {
    expect(stateAt(-98.5, 38.5)).toBe('KS');
    expect(stateAt(-90, 26)).toBeUndefined();
    // inside Florida's bounding box but in open water
    expect(stateAt(-85, 28)).toBeUndefined();
  });
  it('handles multipolygon states and the borders', () => {
    expect(stateAt(-155.5, 19.6)).toBe('HI');   // Big Island
    expect(stateAt(-84.5, 45.8)).toBe('MI');    // Upper Peninsula (hole-free multipolygon)
    expect(stateAt(-119.8, 36.7)).toBe('CA');   // Central Valley
    expect(stateAt(-99, 19.4)).toBeUndefined(); // Mexico City
  });
});
