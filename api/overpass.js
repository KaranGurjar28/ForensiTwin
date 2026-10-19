
/**
 * File: api/overpass.js
 * ForensiTwin OpenStreetMap geometry API
 */

export const config = { maxDuration: 10 }

const PROVIDERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

function makeQuery(lat, lon, radius) {
  const latDelta = radius / 111320
  const lonDelta =
    radius / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))

  const south = Math.max(-90, lat - latDelta)
  const west = Math.max(-180, lon - lonDelta)
  const north = Math.min(90, lat + latDelta)
  const east = Math.min(180, lon + lonDelta)
  const bbox = `${south},${west},${north},${east}`

  return `[out:json][timeout:6];
(
  way["highway"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
);
out geom;`
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

async function requestProvider(endpoint, query, timeoutMs) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ForensiTwin/1.0',
  }

  let response

  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({ data: query }).toString(),
      },
      timeoutMs,
    )
  } catch (error) {
    throw new Error(
      error.name === 'AbortError'
        ? 'POST timed out'
        : `POST failed: ${error.message}`,
    )
  }

  // Some mirrors reject POST; retry that endpoint with GET.
  if ([400, 405, 406, 413, 415].includes(response.status)) {
    const status = response.status
    try {
      await response.body?.cancel()
    } catch {
      // Ignore a body that has already closed.
    }

    try {
      response = await fetchWithTimeout(
        `${endpoint}?data=${encodeURIComponent(query)}`,
        { method: 'GET', headers },
        timeoutMs,
      )
    } catch (error) {
      throw new Error(
        `POST returned HTTP ${status}; GET failed: ${error.message}`,
      )
    }
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).slice(0, 180).replace(/\s+/g, ' ')
    } catch {
      // Response body is unavailable.
    }

    throw new Error(
      `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error(`Expected JSON but received ${contentType || 'unknown content type'}`)
  }

  const data = await response.json()

  if (!Array.isArray(data.elements)) {
    throw new Error('Response is missing the elements array')
  }

  if (data.remark) {
    throw new Error(`Overpass remark: ${data.remark}`)
  }

  return data
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Use GET' })
  }

  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const parsedRadius = Number.parseInt(req.query.radius, 10)
  const radius = Math.min(
    1200,
    Math.max(100, Number.isFinite(parsedRadius) ? parsedRadius : 800),
  )

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({
      error: 'Valid lat and lon values are required.',
    })
  }

  const query = makeQuery(lat, lon, radius)
  const deadline = Date.now() + 8500
  const errors = []
  let emptyResult = null

  // Sequential requests, with a shared deadline under the serverless limit.
  for (const endpoint of PROVIDERS) {
    const remaining = deadline - Date.now()
    if (remaining < 700) {
      errors.push('Stopped before the function execution deadline.')
      break
    }

    const host = new URL(endpoint).host
    const timeoutMs = Math.min(3000, remaining - 150)

    try {
      const json = await requestProvider(endpoint, query, timeoutMs)

      if (json.elements.length === 0) {
        emptyResult ||= { json, mirror: host }
        errors.push(`${host}: valid response contained zero elements`)
        continue
      }

      const roads = json.elements.filter(
        element => element.tags?.highway && element.geometry,
      )
      const buildings = json.elements.filter(
        element =>
          (element.tags?.building || element.tags?.['building:part']) &&
          element.geometry,
      )

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

  res.setHeader('Cache-Control', 'no-store')

  // Never label an empty response as a successful map generation.
  return res.status(502).json({
    error: 'No provider returned usable OpenStreetMap features.',
    details: errors,
    emptyResponseFrom: emptyResult?.mirror || null,
    hint:
      'If every provider fails, configure a dedicated OSM/Overpass service. ' +
      'Public mirrors can reject or rate-limit requests from serverless hosting.',
  })
}
