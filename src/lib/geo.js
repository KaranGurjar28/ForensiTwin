// Coordinate helpers.
// World frame: x = east (m), z = south (m), y = up.  North therefore points to -z.
// Vehicle heading is stored as a compass bearing (0 = N, 90 = E, clockwise).

export const DEG = Math.PI / 180
export const M_PER_DEG_LAT = 111320

export function makeProjector(lat0, lon0) {
  const kx = M_PER_DEG_LAT * Math.cos(lat0 * DEG)
  return {
    lat0,
    lon0,
    toLocal: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * M_PER_DEG_LAT],
    toGeo: (x, z) => [lat0 - z / M_PER_DEG_LAT, lon0 + x / kx],
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const wrap360 = (a) => ((a % 360) + 360) % 360
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

/** bearing (deg) -> unit vector [x, z] in world frame */
export const bearingToVec = (b) => [Math.sin(b * DEG), -Math.cos(b * DEG)]
/** unit/any vector [x, z] -> bearing (deg) */
export const vecToBearing = (x, z) => wrap360(Math.atan2(x, -z) / DEG)
/** three.js rotation.y for a model whose local +Z is "forward" */
export const bearingToRotY = (b) => Math.PI - b * DEG

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const fmtHour = (h) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(mm === 60 ? hh + 1 : hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}
