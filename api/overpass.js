// api/overpass.js
// Vercel serverless function that fetches road + building geometry for a
// location, cached at Vercel's CDN edge (s-maxage + stale-while-revalidate +
// stale-if-error).
//
// Data sources, tried in order:
//   1. Postpass (postpass.geofabrik.de) — a PostGIS database behind a SQL
//      query interface, run by Geofabrik. Not part of the free public
//      Overpass mirror pool, so it isn't subject to the same shared-IP rate
//      limiting those mirrors apply. Response is GeoJSON, converted below
//      into the same Overpass-style `elements` shape the rest of this app
//      already expects, so no other file needs to change.
//   2. The public Overpass mirror pool, as a fallback — kept because
//      Postpass is new to this app and unverified under real load; if its
//      response shape or availability doesn't hold up, the app falls back
//      to working exactly as it did before this change.

export const config = { maxDuration: 30 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

function buildOverpassQuery(lat, lon, radius) {
  const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:25];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${a});
  way["building"](${a});
);
out geom qt;`
}

function buildPostpassQuery(lat, lon, radius) {
  const pt = `ST_SetSRID(ST_MakePoint(${lon.toFixed(6)},${lat.toFixed(6)}),4326)`
  return `
SELECT osm_id, osm_type, tags, geom FROM postpass_line
WHERE tags ? 'highway' AND tags->>'highway' ~ '^(${ROAD_CLASSES})$'
AND ST_DWithin(geom::geography, ${pt}::geography, ${radius})
UNION ALL
SELECT osm_id, osm_type, tags, geom FROM postpass_polygon
WHERE tags ? 'building'
AND ST_DWithin(geom::geography, ${pt}::geography, ${radius})
`.trim()
}

// Convert a GeoJSON FeatureCollection (Postpass's response shape) into the
// Overpass-style `elements` array the rest of the app's parser expects:
// { type: 'way', id, tags, geometry: [{lat, lon}, ...] }
function geoJsonToElements(fc) {
  if (!fc || !Array.isArray(fc.features)) throw new Error('not a GeoJSON FeatureCollection')
  const elements = []
  for (const f of fc.features) {
    const g = f.geometry
    const tags = f.properties?.tags || {}
    const id = f.properties?.osm_id ?? f.id
    if (!g || id == null) continue
    const ringToPoints = (ring) => ring.map(([lon, lat]) => ({ lat, lon }))
    if (g.type === 'LineString') {
      elements.push({ type: 'way', id, tags, geometry: ringToPoints(g.coordinates) })
    } else if (g.type === 'Polygon' && g.coordinates[0]) {
      elements.push({ type: 'way', id, tags, geometry: ringToPoints(g.coordinates[0]) })
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach((poly, i) => {
        if (poly[0]) elements.push({ type: 'way', id: `${id}_${i}`, tags, geometry: ringToPoints(poly[0]) })
      })
    }
  }
  return elements
}

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'User-Agent': 'ForensiTwin/1.0 (forensic collision reconstruction tool; https://forensi-twin.vercel.app)',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function askPostpass(lat, lon, radius, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch('https://postpass.geofabrik.de/api/interpreter', {
      method: 'POST',
      headers: HEADERS,
      body: 'data=' + encodeURIComponent(buildPostpassQuery(lat, lon, radius)),
      signal: controller.signal,
    })
    if (r.status === 429) throw new Error('HTTP 429 (rate limited)')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = await r.json()
    const elements = geoJsonToElements(body)
    return { json: { elements }, mirror: 'postpass.geofabrik.de' }
  } catch (e) {
    throw new Error(`postpass.geofabrik.de: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
  } finally {
    clearTimeout(timer)
  }
}

// Ordered by observed reachability from Vercel's network in this project's
// own testing — overpass-api.de / lz4 have consistently failed to even
// connect, so they're tried last with a short budget.
const OVERPASS_MIRRORS = [
  { url: 'https://overpass.osm.ch/api/interpreter', timeoutMs: 8000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 6000 },
  { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 4000 },
  { url: 'https://lz4.overpass-api.de/api/interpreter', timeoutMs: 3000 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 3000 },
]

async function askOverpassMirror(url, query, timeoutMs) {
  const host = new URL(url).host
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    })
    if (r.status === 429) throw new Error('HTTP 429 (rate limited)')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json()
    if (!Array.isArray(json.elements)) throw new Error('Unexpected response shape')
    return { json, mirror: host }
  } catch (e) {
    throw new Error(`${host}: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
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

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon query params are required and must be numbers' })
    return
  }

  const errors = []
  const emptyResults = []

  const tryAccept = (result) => {
    if (result.json.elements.length > 0) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000')
      res.status(200).json(result)
      return true
    }
    emptyResults.push(result)
    return false
  }

  // 1. Postpass first — a real database, not a rate-limited shared mirror.
  try {
    const result = await askPostpass(lat, lon, radius, 9000)
    if (tryAccept(result)) return
  } catch (e) {
    errors.push(e.message)
  }

  // 2. Fall back to the Overpass mirror pool.
  const overpassQuery = buildOverpassQuery(lat, lon, radius)
  for (const { url, timeoutMs } of OVERPASS_MIRRORS) {
    try {
      const result = await askOverpassMirror(url, overpassQuery, timeoutMs)
      if (tryAccept(result)) return
    } catch (e) {
      errors.push(e.message)
      await sleep(200)
    }
  }

  // An empty result is only trusted once at least two independent sources
  // (Postpass + a mirror, or two mirrors) agree — a single source saying
  // "nothing here" could mean its index is behind, not that the area is
  // genuinely empty.
  if (emptyResults.length >= 2) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=2592000')
    res.status(200).json(emptyResults[0])
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  const reason = emptyResults.length === 1
    ? `Only one source (${emptyResults[0].mirror}) responded, with no data — inconclusive rather than confirmed-empty.\n`
    : ''
  res.status(502).json({ error: reason + 'All data sources failed or gave inconclusive results.\n' + errors.join('\n') })
}