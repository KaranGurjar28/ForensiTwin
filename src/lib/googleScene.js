// WGS84 investigator-supplied site geometry -> ForensiTwin editable mesh input.
// Google Maps imagery and building meshes are NOT extracted or converted.
import { makeProjector } from './geo.js'

export const RADIUS_MIN = 250
export const RADIUS_MAX = 1500
export const clampRadius = (r) => Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round((Number(r) || 800) / 50) * 50))
export const emptySiteLayout = () => ({ roads: [], buildings: [], source: 'investigator-supplied' })

export function validPoint(p) {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) &&
    Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180
}
export function pointDistanceMeters(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Infinity
  const [x, z] = makeProjector(+a.lat, +a.lng).toLocal(+b.lat, +b.lng)
  return Math.hypot(x, z)
}
export function siteCounts(site) {
  return { roads: (site?.roads || []).length, buildings: (site?.buildings || []).length }
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
function limit(v, low, high, fallback) {
  return Number.isFinite(+v) && +v > 0 ? clamp(+v, low, high) : fallback
}
function nearby(a, b) {
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8
}
// Clip an investigator supplied line to a circular reconstruction radius.
// Important for roads that cross the selected area with both endpoints outside it.
function clipSegment(a, b, radius, projector) {
  const [ax, az] = projector.toLocal(a.lat, a.lng)
  const [bx, bz] = projector.toLocal(b.lat, b.lng)
  const dx = bx - ax, dz = bz - az
  const A = dx * dx + dz * dz
  if (A < 1e-10) return null
  const B = 2 * (ax * dx + az * dz)
  const C = ax * ax + az * az - radius * radius
  const intersections = [0, 1]
  const disc = B * B - 4 * A * C
  if (disc >= 0) {
    const k = Math.sqrt(disc)
    for (const t of [(-B - k) / (2 * A), (-B + k) / (2 * A)]) {
      if (t > 0 && t < 1) intersections.push(t)
    }
  }
  intersections.sort((u, v) => u - v)
  for (let i = 0; i < intersections.length - 1; i++) {
    const lo = intersections[i], hi = intersections[i + 1]
    const mid = (lo + hi) / 2
    if ((ax + mid * dx) ** 2 + (az + mid * dz) ** 2 <= radius * radius) {
      const p0 = projector.toGeo(ax + dx * lo, az + dz * lo)
      const p1 = projector.toGeo(ax + dx * hi, az + dz * hi)
      return [{ lat: p0[0], lng: p0[1] }, { lat: p1[0], lng: p1[1] }]
    }
  }
  return null
}

export function createTracedScene(location, radius, site = emptySiteLayout()) {
  if (!validPoint({lat:location?.lat, lng:location?.lon})) throw Error('Select a valid accident location first.')
  const r = clampRadius(radius)
  const center = { lat: +location.lat, lng: +location.lon }
  const projector = makeProjector(center.lat, center.lng)
  const elements = []
  const source = site?.source || 'investigator-supplied'
  let id = 9000
  const R = r * 1.30

  for (const road of site?.roads || []) {
    const points = (road.points || []).filter(validPoint).map(p => ({ lat:+p.lat, lng:+p.lng }))
    if (points.length < 2) continue
    let run = []
    const flush = () => {
      if (run.length >= 2) {
        elements.push({ type:'way', id:id++, geometry:run.map(p => ({lat:p.lat, lon:p.lng})),
          tags: { highway:'residential', name:road.name || 'Surveyed road',
            'ft:width':String(limit(road.width, 2, 32, 6.6)), 'ft:source':source } })
      }
      run = []
    }
    for (let i = 0; i < points.length - 1; i++) {
      const clip = clipSegment(points[i], points[i+1], R, projector)
      if (!clip) { flush(); continue }
      if (run.length && !nearby(run[run.length-1], clip[0])) flush()
      if (!run.length) run.push(clip[0])
      run.push(clip[1])
      if (run.length >= 96) flush()
    }
    flush()
  }
  for (const building of site?.buildings || []) {
    const points = (building.points || []).filter(validPoint).map(p => ({lat:+p.lat, lng:+p.lng}))
    if (points.length < 3) continue
    const [cx, cz] = points.reduce(([sx, sz], p) => {
      const [x,z] = projector.toLocal(p.lat, p.lng)
      return [sx+x/points.length, sz+z/points.length]
    }, [0, 0])
    const anyNearby = points.some(p => {
      const [x,z] = projector.toLocal(p.lat, p.lng)
      return Math.hypot(x,z) <= R
    })
    if (!anyNearby && Math.hypot(cx,cz) > R) continue
    const first = points[0]
    const closed = nearby(first, points[points.length - 1]) ? points : [...points, first]
    elements.push({type:'way',id:id++,geometry:closed.map(p=>({lat:p.lat,lon:p.lng})),
      tags:{building:'yes',height:String(limit(building.height,2,200,8)),'ft:source':source}})
  }
  return {version:3,generator:'ForensiTwin user-supplied geospatial reference',source,center,radius:r,elements}
}