
export const config = { maxDuration: 10 }

const PROVIDERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

function getBounds(lat, lon, radius) {
  const dLat = radius / 111320
  const dLon = radius / (111320 * Math.max(0.15, Math.cos(lat * Math.PI / 180)))

  return [
    Math.max(-90, lat - dLat),
    Math.max(-180, lon - dLon),
    Math.min(90, lat + dLat),
    Math.min(180, lon + dLon),
  ].map(n => n.toFixed(6)).join(',')
}

function makeQuery(lat, lon, radius) {
  const bounds = getBounds(lat, lon, radius)

  return `[out:json][timeout:5];
(
  way["highway"](${bounds});
  way["building"](${bounds});
  relation["building"](${bounds});
);
out geom;`
}

async function fetchProvider(url, query, timeoutMs = 1800) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'ForensiTwin/1.0',
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!Array.isArray(data.elements)) {
      throw new Error('Invalid Overpass response')
    }

    if (data.remark) {
      throw new Error(data.remark)
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Provider timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'GET requests only' })
  }

  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const requestedRadius = Number.parseInt(req.query.radius, 10)
  const radius = Math.min(
    1200,
    Math.max(100, Number.isFinite(requestedRadius) ? requestedRadius : 800),
  )

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({ error: 'Invalid latitude or longitude' })
  }

  const query = makeQuery(lat, lon, radius)
  const errors = []

  for (const endpoint of PROVIDERS) {
    const host = new URL(endpoint).host

    try {
      const json = await fetchProvider(endpoint, query)

      if (json.elements.length === 0) {
        errors.push(`${host}: no features returned`)
        continue
      }

      const roads = json.elements.filter(
        el => el.tags?.highway && Array.isArray(el.geometry),
      )

      const buildings = json.elements.filter(
        el =>
          (el.tags?.building || el.tags?.['building:part']) &&
          Array.isArray(el.geometry),
      )

      // Preserve the response structure used by the frontend.
      res.setHeader(
        'Cache-Control',
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      )

      return res.status(200).json({
        json,
        mirror: host,
        counts: {
          total: json.elements.length,
          roads: roads.length,
          buildings: buildings.length,
        },
      })
    } catch (error) {
      errors.push(`${host}: ${error.message}`)
    }
  }

  return res.status(502).json({
    error: 'No provider returned usable OpenStreetMap features.',
    details: errors,
  })
}
