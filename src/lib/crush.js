// Direction-aware, illustrative vehicle deformation from original mesh vertices.
// It is a visual damage proxy, not a validated crush-energy reconstruction.
export const CRUSH_MAX_FRAC = 0.38
export const crushDepth = (Leff, crush) => crush * Leff * CRUSH_MAX_FRAC

function h3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * `side`: front | rear | left | right. Coordinates are vehicle-local; +Z is forward.
 * `offset` shifts the damaged region toward a corner.
 */
export function deformPositions(orig, out, dims, crush, offset = 0, side = 'front') {
  if (crush <= 0.0005) { out.set(orig); return }
  const { frontZ, Leff, W, H } = dims
  const longitudinal = side === 'front' || side === 'rear'
  const extent = longitudinal ? Leff : W
  const Lc = Math.max(0.2, extent * 0.55)
  const D = crushDepth(extent, crush)
  const center = offset * (longitudinal ? W : Leff) * 0.5
  const spread = (longitudinal ? W : Leff) * (0.9 - 0.45 * Math.abs(offset))
  const boundary = (longitudinal ? Math.abs(frontZ || Leff / 2) : W / 2) - Lc

  for (let i = 0; i < orig.length; i += 3) {
    const x = orig[i], y = orig[i + 1], z = orig[i + 2]
    let t = 0
    if (side === 'front') t = (z - boundary) / Lc
    else if (side === 'rear') t = (-z - boundary) / Lc
    else if (side === 'left') t = (-x - boundary) / Lc
    else t = (x - boundary) / Lc
    if (t <= 0) { out[i] = x; out[i + 1] = y; out[i + 2] = z; continue }
    t = Math.min(1, t)
    const lateral = longitudinal ? x : z
    const dx = (lateral - center) / Math.max(spread, 0.1)
    const wx = Math.exp(-0.5 * dx * dx)
    const w = t * wx
    const ny = h3(y, z, x) - 0.5
    const nAxis = h3(x, y, z) - 0.5
    const nOther = h3(z, x, y) - 0.5
    out[i + 1] = y + D * 0.18 * Math.sin(Math.PI * t) * wx * (y / Math.max(H, 0.1)) + ny * 0.06 * D * w
    if (side === 'front') {
      out[i] = x + nAxis * 0.08 * D * w + (x - center) * 0.08 * crush * w
      out[i + 2] = z - D * w + nOther * 0.1 * D * w
    } else if (side === 'rear') {
      out[i] = x + nAxis * 0.08 * D * w + (x - center) * 0.08 * crush * w
      out[i + 2] = z + D * w + nOther * 0.1 * D * w
    } else if (side === 'left') {
      out[i] = x + D * w + nAxis * 0.1 * D * w
      out[i + 2] = z + nOther * 0.06 * D * w
    } else {
      out[i] = x - D * w + nAxis * 0.1 * D * w
      out[i + 2] = z + nOther * 0.06 * D * w
    }
  }
}