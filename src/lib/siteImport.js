// Import independently obtained GeoJSON as investigator-supplied scene geometry.
// This module does NOT extract data from Google Maps or infer building/road geometry.
// GeoJSON positions use [longitude, latitude]; scene-local uses x=east, z=south.

import { makeProjector } from './geo.js'

const finite = (n) => Number.isFinite(Number(n))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function isPosition(value) {
  return Array.isArray(value) && value.length >= 2 && finite(value[0]) && finite(value[1]) &&
    Math.abs(Number(value[0])) <= 180 && Math.abs(Number(value[1])) <= 90
}
function point(value) {
  return { lat: Number(value[1]), lng: Number(value[0]) }
}
function distinct(points) {
  return points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng)
}
function lineSegments(coords) {
  if (!Array.isArray(coords)) return []
  let run = []
  const runs = []
  const flush = () => { if (run.length >= 2) runs.push(distinct(run)); run = [] }
  for (const p of coords) {
    if (!isPosition(p)) { flush(); continue }
    run.push(point(p))
  }
  flush()
  return runs.filter((r) => r.length >= 2)
}
function ring(coords) {
  if (!Array.isArray(coords)) return []
  const points = distinct(coords.filter(isPosition).map(point))
  if (points.length > 3 && points[0].lat === points.at(-1).lat && points[0].lng === points.at(-1).lng) points.pop()
  return points.length >= 3 ? points : []
}
function propString(props, ...names) {
  for (const n of names) {
    if (props[n] != null && String(props[n]).trim()) return String(props[n]).trim()
  }
  return ''
}
function propNumber(props, fallback, lo, hi, ...names) {
  for (const n of names) {
    const value = Number(props[n])
    if (props[n] !== '' && props[n] != null && Number.isFinite(value) && value > 0) return clamp(value, lo, hi)
  }
  return fallback
}
function category(props, geometryType) {
  const tags = [props.ft_type, props.kind, props.category, props.featureType, props.type, props.highway, props.building]
    .map((v) => String(v ?? '').trim().toLowerCase())
  const roadTag = String(props.highway ?? '').trim().toLowerCase()
  const buildingTag = String(props.building ?? '').trim().toLowerCase()
  const isRoad = (roadTag !== '' && !['no', 'false', '0'].includes(roadTag)) ||
    tags.some((x) => x === 'road' || x === 'street' || x === 'highway' || x === 'primary' || x === 'secondary' || x === 'tertiary' || x === 'service' || x === 'motorway' || x === 'trunk' || x === 'unclassified' || x === 'living_street')
  const isBuilding = (buildingTag !== '' && !['no', 'false', '0'].includes(buildingTag)) ||
    tags.some((x) => x === 'building' || x === 'house' || x === 'commercial' || x === 'residential_building')
  if ((geometryType === 'LineString' || geometryType === 'MultiLineString') && isRoad) return 'road'
  if ((geometryType === 'Polygon' || geometryType === 'MultiPolygon') && isBuilding) return 'building'
  // A property-free geometry is unambiguous only when explicitly supplied as
  // a road/building survey collection; optional caller flag handles that.
  return null
}
function minDistance(points, projector) {
  let min = Infinity
  for (const p of points) {
    const [x, z] = projector.toLocal(p.lat, p.lng)
    min = Math.min(min, Math.hypot(x, z))
  }
  return min
}
function nearSite(points, projector, radius) {
  if (minDistance(points, projector) <= radius * 1.33) return true
  // Catch lines whose endpoints lie outside the area but cross through it.
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = projector.toLocal(points[i].lat, points[i].lng)
    const [bx, bz] = projector.toLocal(points[i + 1].lat, points[i + 1].lng)
    const dx = bx - ax, dz = bz - az
    const t = clamp(-(ax * dx + az * dz) / (dx * dx + dz * dz || 1), 0, 1)
    if (Math.hypot(ax + t * dx, az + t * dz) <= radius * 1.33) return true
  }
  return false
}
function simplify(points, maxPoints = 96) {
  if (points.length <= maxPoints) return points
  const sample = Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * (points.length - 1) / (maxPoints - 1))])
  return distinct(sample)
}

/**
 * @param {object} geojson WGS84 GeoJSON FeatureCollection or single Feature.
 * @param {{lat:number,lon:number}} center selected case location.
 * @param {number} radius meters.
 * @param {{interpretUntyped?:boolean}} options allow geometry-only features.
 * @returns {{roads:Array,buildings:Array,skipped:number,checked:number}}
 */
export function parseSiteGeoJSON(geojson, center, radius = 800, { interpretUntyped = false } = {}) {
  if (!finite(center?.lat) || !finite(center?.lon) || Math.abs(+center.lat) > 90 || Math.abs(+center.lon) > 180) {
    throw Error('Select a valid case location before importing survey data.')
  }
  if (!geojson || typeof geojson !== 'object') throw Error('This is not a GeoJSON object.')
  const features = geojson.type === 'FeatureCollection' ? geojson.features : geojson.type === 'Feature' ? [geojson] : null
  if (!Array.isArray(features)) throw Error('Expected a GeoJSON FeatureCollection or Feature.')
  if (features.length > 5000) throw Error('GeoJSON contains more than 5,000 features. Export only the incident area.')
  const proj = makeProjector(+center.lat, +center.lon)
  const selectedRadius = clamp(+radius || 800, 250, 1500)
  const roads = [], buildings = []
  let skipped = 0
  for (const feature of features) {
    const geometry = feature?.geometry, props = feature?.properties || {}
    if (feature?.type !== 'Feature' || !geometry?.coordinates || !geometry.type) { skipped++; continue }
    const kind = category(props, geometry.type) || (interpretUntyped
      ? /LineString$/.test(geometry.type) ? 'road' : /Polygon$/.test(geometry.type) ? 'building' : null
      : null)
    const name = propString(props, 'name', 'road_name', 'reference', 'ref')
    if (kind === 'road' && roads.length < 600) {
      const lines = geometry.type === 'LineString' ? [geometry.coordinates]
        : geometry.type === 'MultiLineString' ? geometry.coordinates : []
      for (const line of lines) {
        if (roads.length >= 600) break
        for (const valid of lineSegments(line)) {
          if (!nearSite(valid, proj, selectedRadius)) continue
          roads.push({ name: name || `Survey road ${roads.length + 1}`, points: simplify(valid),
            width: propNumber(props, 6.6, 2, 32, 'width_m', 'road_width_m', 'roadWidth', 'width') })
          if (roads.length >= 600) break
        }
      }
    } else if (kind === 'building' && buildings.length < 600) {
      const polys = geometry.type === 'Polygon' ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
      for (const polygon of polys) {
        const valid = ring(polygon?.[0])
        if (valid.length < 3 || !nearSite(valid, proj, selectedRadius)) continue
        buildings.push({ name: name || `Survey building ${buildings.length + 1}`, points: simplify(valid),
          height: propNumber(props, 8, 2, 200, 'height_m', 'building_height_m', 'height', 'estimated_height') })
        if (buildings.length >= 600) break
      }
    } else skipped++
  }
  return { roads, buildings, checked: features.length, skipped }
}