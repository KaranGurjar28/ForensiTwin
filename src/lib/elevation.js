// Elevation grid fetching + bilinear-interpolated sampling. Terrain is an
// enhancement: every function here degrades gracefully to "flat" (heightAt
// returns 0 everywhere) rather than throwing, so a failed or slow elevation
// fetch never blocks or breaks scene generation.
//
// IMPORTANT: the elevation providers (Open-Meteo / Open-Elevation) return
// absolute elevation above sea level (e.g. ~60m in Gandhinagar). The scene's
// local coordinate system treats the pinned location as y=0, so every height
// must be normalized relative to the elevation AT THE PIN, not used raw —
// otherwise the ground plane floats at the pin's actual sea-level height
// while everything else (vehicles, trees, markers) stays at the old y=0.

const cache = new Map()

export function makeFlatSampler() {
  const heightAt = () => 0
  heightAt.available = false
  return heightAt
}

export function makeSampler(n, radius, heights) {
  const centerIdx = Math.floor(heights.length / 2) // grid centre = the pinned location
  const baseline = heights[centerIdx]
  const rel = heights.map((h) => h - baseline) // normalized: ~0 at the pin

  const size = radius * 2
  const heightAt = (x, z) => {
    const u = ((x + radius) / size) * (n - 1)
    const v = ((z + radius) / size) * (n - 1)
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(u)))
    const j0 = Math.max(0, Math.min(n - 2, Math.floor(v)))
    const fu = Math.min(1, Math.max(0, u - i0))
    const fv = Math.min(1, Math.max(0, v - j0))
    const h00 = rel[j0 * n + i0]
    const h10 = rel[j0 * n + i0 + 1]
    const h01 = rel[(j0 + 1) * n + i0]
    const h11 = rel[(j0 + 1) * n + i0 + 1]
    const top = h00 * (1 - fu) + h10 * fu
    const bot = h01 * (1 - fu) + h11 * fu
    return top * (1 - fv) + bot * fv
  }
  heightAt.available = true
  heightAt.baseElevation = baseline // absolute elevation at the pin, for display only
  return heightAt
}

/** percent grade in the direction of `bearingDeg`, sampled a few metres either side of (x,z) */
export function gradeAt(heightAt, x, z, bearingDeg) {
  if (!heightAt.available) return 0
  const DEG = Math.PI / 180
  const dx = Math.sin(bearingDeg * DEG)
  const dz = -Math.cos(bearingDeg * DEG)
  const d = 3
  const h1 = heightAt(x - dx * d, z - dz * d)
  const h2 = heightAt(x + dx * d, z + dz * d)
  return ((h2 - h1) / (2 * d)) * 100
}

export async function fetchElevation(lat, lon, radius, { signal } = {}) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return cache.get(key)
  try {
    const res = await fetch(`/api/elevation?lat=${lat}&lon=${lon}&radius=${radius}`, { signal })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('proxy unavailable')
    const body = await res.json()
    if (!res.ok || !Array.isArray(body.heights)) throw new Error(body?.error || 'bad response')
    const sampler = makeSampler(body.n, body.radius, body.heights)
    cache.set(key, sampler)
    return sampler
  } catch {
    // Terrain is best-effort. A flat sampler keeps the rest of the app working.
    const flat = makeFlatSampler()
    cache.set(key, flat)
    return flat
  }
}