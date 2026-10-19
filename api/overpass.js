// api/overpass.js
// Fetches road + building geometry for a location, cached at Vercel's CDN
// edge (s-maxage + stale-while-revalidate + stale-if-error).
//
// IMPORTANT: Vercel's Hobby plan hard-caps function execution at 10 seconds
// regardless of any `maxDuration` setting — the platform silently clamps it.
// All sources are queried IN PARALLEL via Promise.allSettled so the whole
// function only takes as long as the slowest single timeout, not the sum.
//
// IMPORTANT #2: since April 2026 the main OSM Overpass operators have been
// aggressively rejecting requests that don't identify themselves (missing
// User-Agent/Referer), returning 406, as part of a crackdown on AI-scraper
// abuse — and they explicitly call out traffic from app-hosting platforms
// like Vercel/Netlify as suspicious. We send identifying headers on every
// request, and lean on overpass.private.coffee (states no rate limit for
// normal use) and Postpass (meant for exactly this kind of app) as the
// primary sources, with the official mirrors kept as extra fallbacks.

export const config = { maxDuration: 10 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

function buildOverpassQuery(lat, lon, radius) {
  const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:9];
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

// Identifying headers now required by overpass-api.de and its mirrors to
// avoid 406 — a plain User-Agent alone is no longer enough, they also want
// a Referer. See: community.openstreetmap.org/t/overpass-api-error-406
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  Accept: 'application/json',
  'User-Agent': 'ForensiTwin/1.0 (+https://github.com/KaranGurjar28/ForensiTwin; forensic collision reconstruction tool)',
  Referer: 'https://forensi-twin.vercel.app/',
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

const OVERPASS_MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
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
    if (r.status === 406) throw new Error('HTTP 406 (rejected — try again shortly, per their policy)')
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

  // 9s per source, ALL fired at once — the function's total time is bounded
  // by this single budget (just under Vercel's 10s hard cap), not by the
  // number of sources tried.
  const BUDGET_MS = 9000
  const overpassQuery = buildOverpassQuery(lat, lon, radius)
  const attempts = [
    askPostpass(lat, lon, radius, BUDGET_MS),
    ...OVERPASS_MIRRORS.map((url) => askOverpassMirror(url, overpassQuery, BUDGET_MS)),
  ]

  const settled = await Promise.allSettled(attempts)

  const errors = []
  const emptyResults = []
  for (const s of settled) {
    if (s.status === 'rejected') {
      errors.push(s.reason?.message || String(s.reason))
      continue
    }
    if (s.value.json.elements.length > 0) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000')
      res.status(200).json(s.value)
      return
    }
    emptyResults.push(s.value)
  }

  // An empty result is only trusted once at least two independent sources
  // agree — one source saying "nothing here" could just mean its index is
  // behind, not that the area is genuinely empty.
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