// Frontal crush model: a pure function of the original vertex position, so vertices that
// share a location (box faces, GLB seams) always move together and never tear.

export const CRUSH_MAX_FRAC = 0.38 // deepest intrusion = 38 % of reference length

export const crushDepth = (Leff, crush) => crush * Leff * CRUSH_MAX_FRAC

function h3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * @param orig   Float32Array of original positions (vehicle-local, +Z forward)
 * @param out    Float32Array receiving deformed positions
 * @param dims   { frontZ, Leff, W, H }
 * @param crush  0..1
 * @param offset -1..1  (0 = full-width, +/-1 = corner/small overlap)
 */
export function deformPositions(orig, out, dims, crush, offset = 0) {
  if (crush <= 0.0005) {
    out.set(orig)
    return
  }
  const { frontZ, Leff, W, H } = dims
  const Lc = Leff * 0.55
  const zs = frontZ - Lc
  const D = crushDepth(Leff, crush)
  const c = offset * W * 0.5
  const sig = W * (0.9 - 0.45 * Math.abs(offset))

  for (let i = 0; i < orig.length; i += 3) {
    const x = orig[i], y = orig[i + 1], z = orig[i + 2]
    let t = (z - zs) / Lc
    if (t <= 0) {
      out[i] = x; out[i + 1] = y; out[i + 2] = z
      continue
    }
    if (t > 1) t = 1
    const dx = (x - c) / sig
    const wx = Math.exp(-0.5 * dx * dx)
    const w = t * wx
    const nx = h3(x, y, z) - 0.5
    const ny = h3(y, z, x) - 0.5
    const nz = h3(z, x, y) - 0.5
    out[i] = x + nx * 0.1 * D * w + (x - c) * 0.1 * crush * w
    out[i + 1] = y + D * 0.22 * Math.sin(Math.PI * t) * wx * (y / Math.max(H, 0.1)) + ny * 0.08 * D * w
    out[i + 2] = z - D * w + nz * 0.12 * D * w
  }
}
