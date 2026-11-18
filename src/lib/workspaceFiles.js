import { useStore } from '../store.js'
import { makeProjector } from './geo.js'
import { createTracedScene } from './googleScene.js'

// Geographic exports contain only OpenStreetMap / investigator-provided
// geometry. Google Maps satellite imagery and proprietary 3D tiles are not saved.
const validGeoPoint = (p) => Number.isFinite(Number(p?.lat)) &&
  Number.isFinite(Number(p?.lon ?? p?.lng)) && Math.abs(Number(p.lat)) <= 90 &&
  Math.abs(Number(p.lon ?? p.lng)) <= 180

function toCoordinates(point) {
  return [Number(point.lon ?? point.lng), Number(point.lat)]
}

function polygonRing(points) {
  const coordinates = points.map(toCoordinates)
  if (coordinates.length < 3) return null
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first])
  return coordinates.length >= 4 ? coordinates : null
}

export function buildWorkspaceGeoJSON(state = useStore.getState()) {
  const location = state.location
  if (!validGeoPoint(location)) {
    throw new Error('Choose a valid accident location before saving the workspace.')
  }

  const data = Array.isArray(state.osm?.data?.elements) && state.osm.data.elements.length
    ? state.osm.data
    : createTracedScene(location, state.radius, state.siteLayout)

  const features = []
  for (const element of data.elements || []) {
    if (element?.type !== 'way' || !Array.isArray(element.geometry)) continue
    const points = element.geometry.filter(validGeoPoint)
    const tags = element.tags || {}
    const kind = tags.highway ? 'road' : tags.building ? 'building' : null
    if (!kind) continue

    const geometry = kind === 'road'
      ? points.length >= 2 ? { type: 'LineString', coordinates: points.map(toCoordinates) } : null
      : (() => {
          const ring = polygonRing(points)
          return ring ? { type: 'Polygon', coordinates: [ring] } : null
        })()
    if (!geometry) continue

    const properties = {
      ft_type: kind,
      name: String(tags.name || (kind === 'road' ? 'Road' : 'Building')),
      ...(kind === 'road'
        ? { highway: tags.highway, width_m: Number(tags['ft:width']) || undefined }
        : { building: tags.building, height_m: Number(tags.height) || undefined }),
      source: String(tags['ft:source'] || state.osm?.origin?.source || 'OpenStreetMap / investigator-provided'),
      source_id: element.id,
    }
    features.push({ type: 'Feature', geometry, properties })
  }

  const projector = makeProjector(Number(location.lat), Number(location.lon))
  const scenePoint = (x, z) => {
    const [lat, lon] = projector.toGeo(Number(x) || 0, Number(z) || 0)
    return { type: 'Point', coordinates: [lon, lat] }
  }

  // These point features are useful for GIS. Restore full editable objects,
  // evidence and simulation settings from the companion workspace JSON.
  for (const item of [...(state.vehicles || []), ...(state.objects || [])]) {
    features.push({
      type: 'Feature', geometry: scenePoint(item.x, item.z),
      properties: {
        ft_type: 'scene_object', object_type: item.type, name: item.name,
        heading_deg: Number(item.heading) || 0, id: item.id,
      },
    })
  }
  for (const marker of state.markers || []) {
    features.push({
      type: 'Feature', geometry: scenePoint(marker.x, marker.z),
      properties: {
        ft_type: 'evidence', kind: marker.kind, id: marker.id,
        name: `Evidence ${marker.n || ''}`.trim(),
      },
    })
  }

  return {
    type: 'FeatureCollection',
    name: 'ForensiTwin incident workspace geometry',
    metadata: {
      generator: 'ForensiTwin',
      coordinateReferenceSystem: 'WGS84 (EPSG:4326)',
      center: [Number(location.lon), Number(location.lat)],
      radius_m: state.radius,
      source: state.osm?.origin?.source || state.siteLayout?.source || 'investigator-provided',
      attribution: '© OpenStreetMap contributors; additional tile providers as applicable',
      note: 'Contains OSM / investigator-provided geographic features, not Google 3D meshes. Use the companion 3D-workspace.json to restore the editable case.',
    },
    features,
  }
}

function safeCaseName(value) {
  return String(value || 'workspace').trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64) || 'workspace'
}

function downloadFallback(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function writeIntoDirectory(directory, filename, content) {
  const file = await directory.getFileHandle(filename, { create: true })
  const writable = await file.createWritable()
  try {
    await writable.write(content)
    await writable.close()
  } catch (error) {
    try { await writable.abort() } catch { /* The browser may have closed it already. */ }
    throw error
  }
}

/**
 * Save the complete editable case AND a matching geographic GeoJSON.
 *
 * Chrome / Edge: one folder picker, then both separate files are written there.
 * Other browsers: two ordinary downloads (may require allowing multiple files).
 *
 * Call directly from a button click: showDirectoryPicker needs a user gesture.
 */
export async function saveWorkspaceFiles() {
  const state = useStore.getState()
  if (!state.location) throw new Error('Select an accident location before saving.')

  const workspace = state.serializeWorkspace()
  const geojson = buildWorkspaceGeoJSON(state)
  const baseName = `ForensiTwin_${safeCaseName(state.caseInfo?.number)}`
  const files = [
    {
      name: `${baseName}_3D-workspace.json`,
      content: JSON.stringify(workspace, null, 2),
      mimeType: 'application/json;charset=utf-8',
    },
    {
      name: `${baseName}_geometry.geojson`,
      content: JSON.stringify(geojson, null, 2),
      mimeType: 'application/geo+json;charset=utf-8',
    },
  ]

  if (typeof window.showDirectoryPicker === 'function' && window.isSecureContext) {
    let directory
    try {
      directory = await window.showDirectoryPicker({
        id: 'forensitwin-workspace-export',
        mode: 'readwrite',
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { cancelled: true, files: [], featureCount: geojson.features.length }
      }
      throw new Error(`Could not choose a save folder: ${error?.message || error}`)
    }

    // Both files are saved in the exact same user-selected folder.
    for (const file of files) {
      await writeIntoDirectory(directory, file.name, file.content)
    }
    return {
      cancelled: false, method: 'folder',
      files: files.map((file) => file.name),
      featureCount: geojson.features.length,
    }
  }

  // Firefox / unsupported browsers: retain the two-file export behavior.
  for (const file of files) downloadFallback(file.name, file.content, file.mimeType)
  return {
    cancelled: false, method: 'downloads',
    files: files.map((file) => file.name),
    featureCount: geojson.features.length,
  }
}