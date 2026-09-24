// api/overpass.js
// Vercel serverless function that proxies Overpass API queries server-side.
// Tries mirrors one at a time (not all at once — simultaneous bursts trip
// these free servers' abuse protection) and identifies itself with a proper
// User-Agent, since Overpass mirrors are far more likely to rate-limit or
// silently drop requests that look anonymous/automated.

export const config = { maxDuration: 20 }

const MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'User-Agent': 'ForensiTwin/1.0 (forensic collision reconstruction tool; https://forensi-twin.vercel.app)',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function askMirror(url, query, timeoutMs) {
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const query = req.body?.query
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Missing "query" string in JSON body' })
    return
  }

  // Try mirrors one at a time, not all in parallel — a burst of simultaneous
  // requests from the same server is what trips these mirrors' rate limits.
  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    try {
      const result = await askMirror(url, query, 3500)
      res.status(200).json(result)
      return
    } catch (e) {
      errors.push(e.message)
      await sleep(150) // brief gap between attempts, same courtesy reason
    }
  }

  res.status(502).json({ error: 'All Overpass servers failed.\n' + errors.join('\n') })
}