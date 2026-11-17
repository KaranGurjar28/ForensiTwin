/**
 * Zero-key, free map geometry loader for ForensiTwin.
 *
 * Instead of Overpass (which repeatedly timed out or returned HTML), request
 * pre-generated vector tiles from OpenFreeMap. If a tile cannot be retrieved,
 * try the OSM Foundation's Shortbread vector tiles (different tile schema).
 * Both are based on OpenStreetMap, NOT extracted from Google Maps imagery.
 *
 * A successful scene AND each tile is cached in IndexedDB. A saved case can
 * still carry its own geometry snapshot via store.js. There is no free public
 * online service with a 100% availability guarantee; actual gaps are reported.
 *
 * Attribution required wherever generated geometry is shown or exported:
 *   © OpenStreetMap contributors · OpenMapTiles / OpenFreeMap (when applicable)
 */
import { tileToElements, tilesForLocation } from './vectorTileGeometry.js'

const SOURCES = [
  {
    id: 'openfreemap',
    label: 'OpenFreeMap (OpenMapTiles)',
    url: (t) => `https://tiles.openfreemap.org/planet/latest/${t.z}/${t.x}/${t.y}.pbf`,
  },
  {
    id: 'osm-shortbread',
    label: 'OpenStreetMap vector tiles (Shortbread)',
    url: (t) => `https://vector.openstreetmap.org/shortbread_v1/${t.z}/${t.x}/${t.y}.mvt`,
  },
]

const DATABASE = 'forensitwin-geography-tiles-v1'
const SCENES = 'scenes'
const TILES = 'tiles'
const sceneMemory = new Map()
const tileMemory = new Map()
const MAX_TILE_BYTES = 12 * 1024 * 1024
const MAX_SCENE_ELEMENTS = 12000

export function geometryKey(lat, lon, radius) {
  const r = Math.min(1500, Math.max(250, Math.round(+radius || 800)))
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)},${r}`
}

export function geometryCounts(data) {
  const items = data?.elements || []
  return {
    roads: items.filter(e => e?.type === 'way' && e.tags?.highway && e.geometry?.length > 1).length,
    buildings: items.filter(e => e?.type === 'way' && e.tags?.building && e.geometry?.length > 2).length,
  }
}

export function usableGeometry(data) {
  if (!data || !Array.isArray(data.elements)) return false
  const { roads, buildings } = geometryCounts(data)
  return roads + buildings > 0
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SCENES)) db.createObjectStore(SCENES)
      if (!db.objectStoreNames.contains(TILES)) db.createObjectStore(TILES)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function cacheRead(store, key) {
  const memory = store === SCENES ? sceneMemory : tileMemory
  if (memory.has(key)) return memory.get(key)
  let db
  try {
    db = await openDatabase()
    if (!db) return null
    const record = await new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    if (record) memory.set(key, record)
    return record
  } catch (error) {
    console.warn('[ForensiTwin] Geographic cache read unavailable:', error)
    return null
  } finally { db?.close() }
}

async function cacheWrite(store, key, record) {
  const memory = store === SCENES ? sceneMemory : tileMemory
  memory.set(key, record)
  let db
  try {
    db = await openDatabase()
    if (!db) return
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(record, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.warn('[ForensiTwin] Could not persist geographic cache:', error)
  } finally { db?.close() }
}

async function fetchBinaryTile(url, externalSignal, timeout = 16000) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      method: 'GET', mode: 'cors', credentials: 'omit', signal: controller.signal,
      headers: { Accept: 'application/vnd.mapbox-vector-tile,application/x-protobuf,application/octet-stream,*/*' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const kind = (response.headers.get('content-type') || '').toLowerCase()
    if (kind.includes('text/html') || kind.includes('text/plain')) throw new Error('Tile server returned HTML or text')
    const data = await response.arrayBuffer()
    if (!data.byteLength || data.byteLength > MAX_TILE_BYTES) throw new Error('Empty or oversized vector tile')
    const prefix = new TextDecoder().decode(new Uint8Array(data.slice(0, 24))).trimStart().toLowerCase()
    if (prefix.startsWith('<!doctype') || prefix.startsWith('<html') || prefix.startsWith('{')) {
      throw new Error('Non-vector-tile response')
    }
    return data
  } catch (error) {
    if (externalSignal?.aborted) throw new Error('Geography loading cancelled')
    if (controller.signal.aborted) throw new Error(`Request timed out after ${Math.round(timeout / 1000)} s`)
    throw error
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onAbort)
  }
}

async function loadTile(tile, center, radius, { signal, forceRefresh } = {}) {
  const failures = []
  for (const source of SOURCES) {
    if (signal?.aborted) throw new Error('Geography loading cancelled')
    const tileKey = `${source.id}/${tile.z}/${tile.x}/${tile.y}`
    if (!forceRefresh) {
      const cached = await cacheRead(TILES, tileKey)
      if (cached?.binary) {
        try {
          const elements = tileToElements(cached.binary, tile, center, radius)
          return { elements, source: source.label, cached: true }
        } catch (error) {
          // Unexpected cache corruption. Retry network before trying another source.
          tileMemory.delete(tileKey)
          console.warn('[ForensiTwin] Ignoring unreadable cached map tile', error)
        }
      }
    }
    try {
      const binary = await fetchBinaryTile(source.url(tile), signal)
      const elements = tileToElements(binary, tile, center, radius)
      await cacheWrite(TILES, tileKey, { binary, savedAt: Date.now() })
      return { elements, source: source.label, cached: false }
    } catch (error) {
      if (signal?.aborted) throw error
      failures.push(`${source.label}: ${error?.message || error}`)
    }
  }
  return { elements: [], source: null, cached: false, failed: failures.join(' / ') }
}

// Basic concurrency queue: never make more than 4 tile requests at once.
async function mapLimited(items, parallel, mapper) {
  const results = Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function cleanAndNumber(items) {
  const out = []
  let nextId = 1
  const seen = new Set()
  for (const item of items) {
    const g = item?.geometry
    if (!Array.isArray(g) || g.length < (item.tags?.building ? 4 : 2)) continue
    if (!g.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))) continue
    // Prevent a geometry that repeats exactly along two tile edges becoming doubled.
    const a = g[0], b = g[g.length - 1]
    const key = `${item.tags?.building ? 'b' : 'r'}:${a.lat.toFixed(5)},${a.lon.toFixed(5)}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}:${g.length}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...item, id: nextId++ })
    if (out.length >= MAX_SCENE_ELEMENTS) break
  }
  return out
}

/**
 * @returns {Promise<{data:{elements:object[]},source:string,cached:boolean,partial:boolean}>}
 */
export async function fetchReconstructionGeometry(lat, lon, radius, { onStatus, signal, forceRefresh = false } = {}) {
  const latitude = Number(lat), longitude = Number(lon), r = Math.min(1500, Math.max(250, Number(radius) || 800))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
    throw new Error('Invalid map coordinates for vector tile coverage')
  }
  const key = geometryKey(latitude, longitude, r)
  if (!forceRefresh) {
    const cached = await cacheRead(SCENES, key)
    if (cached && usableGeometry(cached.data)) {
      onStatus?.('Opened locally cached buildings and roads. No map download was needed.')
      return { ...cached, cached: true }
    }
  }

  const center = { lat: latitude, lon: longitude }
  const tiles = tilesForLocation(latitude, longitude, r)
  onStatus?.(`Reading ${tiles.length} free vector map tiles (roads and buildings)...`)
  let finished = 0
  const results = await mapLimited(tiles, 4, async tile => {
    const result = await loadTile(tile, center, r, { signal, forceRefresh })
    finished++
    onStatus?.(`Map tiles: ${finished}/${tiles.length} · ${result.source || 'source unavailable'}...`)
    return result
  })
  if (signal?.aborted) throw new Error('Geography loading cancelled')
  const failures = results.filter(result => result.failed)
  const elements = cleanAndNumber(results.flatMap(result => result.elements))
  const data = { elements, source: 'vector-tiles', partial: failures.length > 0 }
  const counts = geometryCounts(data)
  if (!usableGeometry(data)) {
    const failureDetails = failures.length ? ` Tile errors: ${failures.slice(0, 3).map(f => f.failed).join(' | ')}` : ''
    throw new Error('No mapped roads or building footprints were available for this location. Try another location or import an independently sourced GeoJSON file.' + failureDetails)
  }
  const sources = [...new Set(results.filter(result => result.source).map(result => result.source))]
  const source = sources.join(' + ') || 'Free OpenStreetMap vector tiles'
  const partial = failures.length > 0
  const result = { data, source, cached: results.every(v => v.cached), partial }
  // Do not cache incomplete reconstructions as if the entire site was retrieved.
  if (!partial) await cacheWrite(SCENES, key, result)
  onStatus?.(`${counts.roads} mapped road segments, ${counts.buildings} building footprints${partial ? ` (WARNING: ${failures.length} tiles unavailable — incomplete map)` : ''}.`)
  return result
}