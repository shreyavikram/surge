/** Can this browser create a WebGL context at all? MapLibre needs one; otherwise we draw the SVG map. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}
