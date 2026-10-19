// api/elevation.js
// Fetches a grid of elevation samples around a point, for terrain draping and
// grade-aware physics. Same reliability pattern as api/overpass.js: try a
// primary source, fall back to a secondary, cache aggressively at Vercel's
// edge with stale-if-error so a bad moment for both providers doesn't break
// a location that was ever successfully loaded before.

export const config = { maxDuration: 20 }

function buildGrid(lat, lon, radius, n) {
  const M_PER_DEG_LAT = 111320
  const kx = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  const points = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * 2 * radius
      const z = (j / (n - 1) - 0.5) * 2 * radius
      points.push({ lat: lat - z / M_PER_DEG_LAT, lon: lon + x / kx })
    }
  }
  return points
}

async function fromOpenMeteo(points, timeoutMs) {
  const lats = points.map((p) => p.lat.toFixed(6)).join(',')
  const lons = points.map((p) => p.lon.toFixed(6)).join(',')
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: controller.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = await r.json()
    if (!Array.isArray(body.elevation) || body.elevation.length !== points.length) {
      throw new Error('unexpected response shape')
    }
    return body.elevation
  } finally {
    clearTimeout(timer)
  }
}

async function fromOpenElevation(points, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })) }),
      signal: controller.signal,
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = await r.json()
    if (!Array.isArray(body.results) || body.results.length !== points.length) {
      throw new Error('unexpected response shape')
    }
    return body.results.map((r) => r.elevation)
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed — use GET with lat/lon/radius query params' })
    return
  }

  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  const radius = Math.min(1500, Math.max(100, parseInt(req.query.radius, 10) || 800))
  const n = 13 // 13x13 = 169 sample points, enough for smooth interpolation

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon query params are required and must be numbers' })
    return
  }

  const points = buildGrid(lat, lon, radius, n)
  const errors = []

  for (const [name, fn] of [['open-meteo', fromOpenMeteo], ['open-elevation', fromOpenElevation]]) {
    try {
      const heights = await fn(points, 9000)
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=7776000')
      res.status(200).json({ n, radius, heights, source: name })
      return
    } catch (e) {
      errors.push(`${name}: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
    }
  }

  // Elevation is an enhancement, not a hard requirement — the app works on
  // flat ground without it. Fail quietly cacheable-short so a retry soon is cheap.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-if-error=7776000')
  res.status(502).json({ error: 'All elevation sources failed.\n' + errors.join('\n') })
}