import assert from 'node:assert/strict'
import { parseVectorTile, decodeGeometry, tileAt, tilePointToLatLon, tilesForLocation, tileToElements } from '../src/lib/vectorTileGeometry.js'
import { fetchReconstructionGeometry, geometryCounts, usableGeometry } from '../src/lib/reconstructionData.js'
import { buildWorld } from '../src/lib/siteGeometry.js'

// Generate a valid tiny Mapbox Vector Tile in memory. No public tile server needed.
const variable = n => {
  let value = Math.floor(n), a = []
  do { let b = value % 128; value = Math.floor(value / 128); if (value > 0) b |= 128; a.push(b) } while (value > 0)
  return a
}
const field = (n, type, body) => [...variable((n << 3) | type), ...body]
const text = s => Array.from(new TextEncoder().encode(s))
const sized = (n, b) => field(n, 2, [...variable(b.length), ...b])
const scalar = (n, v) => field(n, 0, variable(v))
const value = v => typeof v === 'string' ? sized(1, text(v)) : scalar(5, v)
const zz = x => x < 0 ? -x * 2 - 1 : x * 2
function geom(points, polygon) {
  const coords = []
  let lx = 0, ly = 0
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    if (i === 0) coords.push(9)
    else if (i === 1) coords.push(2 + ((points.length - 1) << 3))
    coords.push(zz(x - lx), zz(y - ly))
    lx = x; ly = y
  }
  if (polygon) coords.push(15)
  return coords
}
function feature(tags, type, commands) {
  return [...scalar(1, 1), ...sized(2, tags.flatMap(variable)), ...scalar(3, type), ...sized(4, commands.flatMap(variable))]
}
function layer(name, names, vals, features) {
  return [...sized(1, text(name)), ...features.flatMap(f => sized(2, f)), ...names.flatMap(k => sized(3, text(k))), ...vals.flatMap(v => sized(4, value(v))), ...scalar(5, 4096), ...scalar(15, 2)]
}
function fixture(tile, centre, type = 'omt') {
  const c = tileAt(centre.lat, centre.lon, tile.z)
  const x = Math.round((c.x - tile.x) * 4096)
  const y = Math.round((c.y - tile.y) * 4096)
  const road = geom([[x - 70, y], [x + 80, y + 2]], false)
  const building = geom([[x + 10, y + 30], [x + 38, y + 30], [x + 38, y + 65], [x + 10, y + 65]], true)
  if (type === 'shortbread') {
    return Uint8Array.from([
      ...sized(3, layer('streets', ['kind', 'oneway'], ['residential', 1], [feature([0,0,1,1], 2, road)])),
      ...sized(3, layer('buildings', ['dummy'], [1], [feature([0,0], 3, building)])),
    ])
  }
  return Uint8Array.from([
    ...sized(3, layer('transportation', ['class', 'name'], ['minor', 'Test Street'], [feature([0,0,1,1], 2, road)])),
    ...sized(3, layer('building', ['render_height'], [12], [feature([0,0], 3, building)])),
  ])
}

const centre = {lat:23.08295,lon:72.63529}
const tile = tilesForLocation(centre.lat, centre.lon, 250)[0]
const centreTile = {z:14, x:Math.floor(tileAt(centre.lat,centre.lon,14).x), y:Math.floor(tileAt(centre.lat,centre.lon,14).y)}

for (const schema of ['omt','shortbread']) {
  const buffer = fixture(centreTile,centre,schema)
  const names = parseVectorTile(buffer).map(l=>l.name)
  assert.equal(names.length,2)
  const e = tileToElements(buffer, centreTile, centre, 250)
  assert.equal(e.filter(x => x.tags.highway).length,1)
  assert.equal(e.filter(x => x.tags.building).length,1)
  const first=e[0].geometry[0]
  assert(Math.abs(first.lat-centre.lat)<0.01 && Math.abs(first.lon-centre.lon)<0.01)
  console.log(`${schema}: 1 road and 1 building converted`)
}

for (const radius of [250,800,1500]) {
  const tiles = tilesForLocation(centre.lat, centre.lon, radius)
  assert(tiles.length>=1 && tiles.length<64)
  assert(tiles.some(t=>t.x===centreTile.x&&t.y===centreTile.y))
  console.log(`${radius}m: ${tiles.length} vector tiles cover selected area`)
}

// In-browser downloader integration, with mocked fetch and no network connection.
const originalFetch=globalThis.fetch
let requests=0
try {
  globalThis.fetch=async url=>{
    requests++
    const [,z,x,y] = String(url).match(/\/(\d+)\/(\d+)\/(\d+)\.(?:pbf|mvt)/) || []
    if(!z)throw new Error('invalid tile URL ' + url)
    const b = fixture({z:+z,x:+x,y:+y},centre,'omt')
    return {ok:true,headers:new Map([['content-type','application/x-protobuf']]),arrayBuffer:async()=>b.buffer}
  }
  for (const radius of [250, 800, 1500]) {
    const first=await fetchReconstructionGeometry(centre.lat,centre.lon,radius)
    assert(usableGeometry(first.data))
    const counts=geometryCounts(first.data)
    assert(counts.roads>=1 && counts.buildings>=1)
    assert(requests>0)
    const world=buildWorld(first.data, centre, {radius,heightAt:()=>0})
    assert(world?.stats?.roads>=1 && world?.stats?.buildings>=1, `Three.js meshes at ${radius}m`)
    const countBefore=requests
    const second=await fetchReconstructionGeometry(centre.lat,centre.lon,radius)
    assert(second.cached && requests===countBefore)
    console.log(`${radius}m: ${counts.roads} roads + ${counts.buildings} buildings converted to Three.js meshes; second load cached`)
  }
  // OpenFreeMap unavailable -> Shortbread fallback succeeds without Overpass.
  const successRequests=requests
  globalThis.fetch=async url => {
    requests++
    if (String(url).includes('openfreemap.org')) throw Error('Primary test outage')
    const [,z,x,y] = String(url).match(/\/(\d+)\/(\d+)\/(\d+)\.(?:pbf|mvt)/) || []
    const b=fixture({z:+z,x:+x,y:+y},centre,'shortbread')
    return {ok:true,headers:new Map([['content-type','application/x-protobuf']]),arrayBuffer:async()=>b.buffer}
  }
  const fallback=await fetchReconstructionGeometry(centre.lat,centre.lon,250,{forceRefresh:true})
  assert(usableGeometry(fallback.data) && /Shortbread/.test(fallback.source))
  assert(requests>successRequests)
  console.log('Provider outage: fallback to OSMF Shortbread successful')
} finally {globalThis.fetch=originalFetch}
console.log('PASS: all free-vector-tile geometry tests')