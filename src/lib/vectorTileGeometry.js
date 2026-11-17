/**
 * Free-vector-tile -> ForensiTwin OSM-compatible road/building geometry.
 * Supports OpenMapTiles (OpenFreeMap) and Shortbread (OSMF) schemas.
 * No API key, Protobuf package, or Node runtime required in the browser.
 * Only actual tile polygons/lines are converted; no synthetic neighbourhoods.
 */

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
export const VECTOR_TILE_ZOOM = 14

class PbfReader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    this.pos = 0
    this.end = this.bytes.length
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength)
    this.decoder = new TextDecoder()
  }
  check(count) {
    if (this.pos + count > this.end) throw new Error('Truncated vector tile')
  }
  uint() {
    // MVT counts / coordinates are small. Feature IDs can be wider than 32 bits.
    let value = 0
    let scale = 1
    for (let i = 0; i < 10; i++) {
      this.check(1)
      const c = this.bytes[this.pos++]
      value += (c & 0x7f) * scale
      if (!(c & 0x80)) return value
      scale *= 128
    }
    throw new Error('Invalid vector-tile varint')
  }
  sized() {
    const count = this.uint()
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid vector tile length')
    this.check(count)
    const b = this.bytes.subarray(this.pos, this.pos + count)
    this.pos += count
    return b
  }
  string() { return this.decoder.decode(this.sized()) }
  packed() {
    const sub = new PbfReader(this.sized())
    const values = []
    while (sub.pos < sub.end) values.push(sub.uint())
    return values
  }
  float() { this.check(4); const n = this.view.getFloat32(this.pos, true); this.pos += 4; return n }
  double() { this.check(8); const n = this.view.getFloat64(this.pos, true); this.pos += 8; return n }
  skip(wire) {
    if (wire === 0) { this.uint(); return }
    if (wire === 1) { this.check(8); this.pos += 8; return }
    if (wire === 2) { this.sized(); return }
    if (wire === 5) { this.check(4); this.pos += 4; return }
    throw new Error(`Unsupported protobuf wire type ${wire}`)
  }
}

const zigzag = (v) => v % 2 === 0 ? v / 2 : -(v + 1) / 2

function readValue(buffer) {
  const reader = new PbfReader(buffer)
  let value = null
  while (reader.pos < reader.end) {
    const k = reader.uint(), field = k >>> 3, wire = k & 7
    if (field === 1 && wire === 2) value = reader.string()
    else if (field === 2 && wire === 5) value = reader.float()
    else if (field === 3 && wire === 1) value = reader.double()
    else if (field === 4 && wire === 0) value = reader.uint()
    else if (field === 5 && wire === 0) value = reader.uint()
    else if (field === 6 && wire === 0) value = zigzag(reader.uint())
    else if (field === 7 && wire === 0) value = Boolean(reader.uint())
    else reader.skip(wire)
  }
  return value
}

function readFeature(buffer, keys, values) {
  const r = new PbfReader(buffer)
  let id = 0, type = 0, tags = [], geometry = []
  while (r.pos < r.end) {
    const k = r.uint(), field = k >>> 3, wire = k & 7
    if (field === 1 && wire === 0) id = r.uint()
    else if (field === 2 && wire === 2) tags = tags.concat(r.packed())
    else if (field === 2 && wire === 0) tags.push(r.uint())
    else if (field === 3 && wire === 0) type = r.uint()
    else if (field === 4 && wire === 2) geometry = geometry.concat(r.packed())
    else if (field === 4 && wire === 0) geometry.push(r.uint())
    else r.skip(wire)
  }
  const properties = {}
  for (let i = 0; i + 1 < tags.length; i += 2) {
    const key = keys[tags[i]]
    if (key !== undefined && tags[i + 1] < values.length) properties[key] = values[tags[i + 1]]
  }
  return { id, type, properties, geometry }
}

function readLayer(buffer) {
  const r = new PbfReader(buffer)
  let name = '', extent = 4096
  const keys = [], values = [], features = []
  while (r.pos < r.end) {
    const k = r.uint(), field = k >>> 3, wire = k & 7
    if (field === 1 && wire === 2) name = r.string()
    else if (field === 2 && wire === 2) features.push(r.sized())
    else if (field === 3 && wire === 2) keys.push(r.string())
    else if (field === 4 && wire === 2) values.push(readValue(r.sized()))
    else if (field === 5 && wire === 0) extent = r.uint()
    else r.skip(wire)
  }
  if (!(extent > 0 && extent < 1e8)) throw new Error('Invalid vector tile extent')
  return { name, extent, features: features.map((f) => readFeature(f, keys, values)) }
}

/** Parse a Mapbox Vector Tile (.pbf or .mvt), optionally selecting named layers. */
export function parseVectorTile(binary, wanted = ['building', 'transportation', 'buildings', 'streets']) {
  const r = new PbfReader(binary)
  const found = []
  while (r.pos < r.end) {
    const k = r.uint(), field = k >>> 3, wire = k & 7
    if (field === 3 && wire === 2) {
      const raw = r.sized()
      // Parsing layer contents is safe even when a tile has many label layers.
      const layer = readLayer(raw)
      if (wanted.includes(layer.name)) found.push(layer)
    } else r.skip(wire)
  }
  return found
}

/** Decode delta-encoded tile geometries into arrays of tile-local [x,y] points. */
export function decodeGeometry(commands) {
  const paths = []
  let x = 0, y = 0, path = null, index = 0
  while (index < commands.length) {
    const word = commands[index++]
    const command = word % 8
    const count = Math.floor(word / 8)
    if (count < 1 || count > 100000) throw new Error('Invalid vector geometry command')
    if (command === 1 || command === 2) {
      if (index + count * 2 > commands.length) throw new Error('Incomplete vector geometry')
      for (let i = 0; i < count; i++) {
        x += zigzag(commands[index++])
        y += zigzag(commands[index++])
        if (command === 1 || !path) {
          path = []
          paths.push(path)
        }
        path.push([x, y])
      }
    } else if (command === 7) {
      if (path && path.length > 2) {
        const first = path[0], last = path[path.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) path.push([...first])
      }
    } else throw new Error(`Unsupported vector-tile geometry command ${command}`)
  }
  return paths
}

export function tileAt(lat, lon, z = VECTOR_TILE_ZOOM) {
  const scale = 2 ** z
  const clampedLat = Math.min(85.0511287, Math.max(-85.0511287, lat))
  const x = ((lon + 180) / 360) * scale
  const y = (1 - Math.asinh(Math.tan(clampedLat * RAD)) / Math.PI) * scale / 2
  return { x, y }
}

export function tilePointToLatLon(x, y, z, col, row, extent) {
  const scale = 2 ** z
  const nlon = ((col + x / extent) / scale) * 360 - 180
  const mercY = Math.PI * (1 - 2 * (row + y / extent) / scale)
  const nlat = Math.atan(Math.sinh(mercY)) * DEG
  return { lat: nlat, lon: nlon }
}

/** Only request tiles overlapping the user-selected circular area (no bulk download). */
export function tilesForLocation(lat, lon, radius, z = VECTOR_TILE_ZOOM) {
  const r = Math.min(1500, Math.max(250, Number(radius) || 800))
  const latSpan = r / 111320
  const lonSpan = r / (111320 * Math.max(0.08, Math.cos(lat * RAD)))
  const a = tileAt(lat - latSpan, lon - lonSpan, z)
  const b = tileAt(lat + latSpan, lon + lonSpan, z)
  const minX = Math.floor(Math.min(a.x, b.x)), maxX = Math.floor(Math.max(a.x, b.x))
  const minY = Math.floor(Math.min(a.y, b.y)), maxY = Math.floor(Math.max(a.y, b.y))
  const tiles = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) tiles.push({ z, x, y })
  }
  if (tiles.length > 64) throw new Error('Selected map area needs too many tiles at this latitude. Reduce the reconstruction radius.')
  return tiles
}

const highwayFromType = (kind, props, shortbread) => {
  const value = String(kind || '').toLowerCase()
  if (props?.rail || /rail|tram|subway|aeroway|ferry|runway/.test(value)) return null
  // OpenMapTiles class values are broader than OSM highway tags.
  const lookup = {
    motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary',
    tertiary: 'tertiary', minor: 'residential', major: 'primary', street: 'residential',
    residential: 'residential', service: 'service', track: 'service',
    motorway_link: 'motorway_link', trunk_link: 'trunk_link',
    primary_link: 'primary_link', secondary_link: 'secondary_link', tertiary_link: 'tertiary_link',
    living_street: 'living_street', unclassified: 'unclassified', road: 'road',
    path: 'service', pedestrian: 'living_street', cycleway: 'service', footway: 'service',
  }
  const cls = lookup[value]
  if (!cls) return null
  if (shortbread && props?.link && /^(motorway|trunk|primary|secondary|tertiary)$/.test(cls)) return cls + '_link'
  // A thin visual trail is not a 6m vehicle road. Limit schematic width.
  return cls
}

function featureBoundsClose(paths, tile, extent, center, radius) {
  const metersLat = 111320
  const metersLon = 111320 * Math.max(0.08, Math.cos(center.lat * RAD))
  const reach = Math.max(70, radius * 1.25)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const path of paths) for (const [x, y] of path) {
    const point = tilePointToLatLon(x, y, tile.z, tile.x, tile.y, extent)
    const dx = (point.lon - center.lon) * metersLon
    const dy = (point.lat - center.lat) * metersLat
    minX = Math.min(minX, dx); maxX = Math.max(maxX, dx)
    minY = Math.min(minY, dy); maxY = Math.max(maxY, dy)
  }
  return minX <= reach && maxX >= -reach && minY <= reach && maxY >= -reach
}

function signedArea(points) {
  let sum = 0
  for (let i = 1; i < points.length; i++) sum += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1]
  return sum / 2
}

/** Converts a single tile to the {type:'way', tags, geometry} format existing siteGeometry.js uses. */
export function tileToElements(buffer, tile, center, radius, startId = 1) {
  const layers = parseVectorTile(buffer)
  const elements = []
  let id = startId
  for (const layer of layers) {
    const buildingLayer = layer.name === 'building' || layer.name === 'buildings'
    const roadLayer = layer.name === 'transportation' || layer.name === 'streets'
    if (!buildingLayer && !roadLayer) continue
    const shortbread = layer.name === 'streets'
    for (const feature of layer.features) {
      if (buildingLayer && feature.type !== 3) continue
      if (roadLayer && feature.type !== 2) continue
      const props = feature.properties
      let cls
      if (roadLayer) {
        cls = highwayFromType(shortbread ? props.kind : props.class, props, shortbread)
        if (!cls) continue
      }
      const paths = decodeGeometry(feature.geometry).filter(p => p.length >= (buildingLayer ? 4 : 2))
      if (!paths.length || !featureBoundsClose(paths, tile, layer.extent, center, radius)) continue
      let selected = paths
      if (buildingLayer) {
        // MVT polygon rings have opposite windings for exterior and holes.
        const outer = paths.reduce((best, ring) => Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best, paths[0])
        const sign = Math.sign(signedArea(outer)) || 1
        selected = paths.filter(r => Math.sign(signedArea(r)) === sign && Math.abs(signedArea(r)) > 9)
      }
      for (const path of selected) {
        const geometry = path.map(([x, y]) => tilePointToLatLon(x, y, tile.z, tile.x, tile.y, layer.extent))
        const tags = buildingLayer ? { building: 'yes' } : { highway: cls }
        if (buildingLayer) {
          const h = Number(props.render_height ?? props.height)
          const levels = Number(props.levels ?? props['building:levels'])
          if (Number.isFinite(h) && h > 1) tags.height = h
          else if (Number.isFinite(levels) && levels > 0) tags['building:levels'] = levels
        } else {
          if (props.name) tags.name = String(props.name)
          if (props.oneway === true || props.oneway === 1) tags.oneway = 'yes'
          if (cls === 'service' && /path|cycleway|footway/.test(String(props.class ?? props.kind))) tags['ft:width'] = '2.5'
        }
        elements.push({ type: 'way', id: id++, tags, geometry })
      }
    }
  }
  return elements
}