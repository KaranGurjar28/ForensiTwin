import { useMemo, useState } from 'react'
import { useStore } from '../store.js'
import { parseSiteGeoJSON } from '../lib/siteImport.js'
import { createTracedScene } from '../lib/googleScene.js'

const backdrop = {
  position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(5,14,24,.64)',
  display: 'grid', placeItems: 'center', padding: 16, pointerEvents: 'auto',
}
const card = {
  width: 'min(580px, 100%)', maxHeight: 'min(84vh, 700px)', overflowY: 'auto',
  padding: 22, borderRadius: 14, background: '#f7fafc', color: '#142231',
  border: '1px solid #d6e1e8', boxShadow: '0 15px 70px rgba(0,0,0,.4)',
}
const button = {
  background: '#f6c400', color: '#142231', fontWeight: 750, fontSize: 13,
  border: 0, borderRadius: 7, padding: '10px 13px', cursor: 'pointer',
}
const neutral = { ...button, background: '#e7eef3' }

function isWorkspaceFile(data) {
  return data && typeof data === 'object' &&
    data.location && Number.isFinite(Number(data.location.lat)) &&
    Number.isFinite(Number(data.location.lon)) &&
    Array.isArray(data.vehicles) &&
    (data.fileType === 'ForensiTwin Editable 3D Workspace' ||
      Array.isArray(data.mapSnapshot?.elements))
}

function savedGeometryCounts(data) {
  const elements = data?.mapSnapshot?.elements || []
  return {
    roads: elements.filter((e) => e?.tags?.highway && e.geometry?.length > 1).length,
    buildings: elements.filter((e) => e?.tags?.building && e.geometry?.length > 2).length,
  }
}

export default function SiteDataImport({ onClose, onComplete, onEmptyScene }) {
  const location = useStore((s) => s.location)
  const radius = useStore((s) => s.radius)
  const siteLayout = useStore((s) => s.siteLayout)
  const [data, setData] = useState(null)
  const [filename, setFilename] = useState('')
  const [interpretUntyped, setInterpretUntyped] = useState(false)
  const [append, setAppend] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => {
    if (!data) return null
    if (isWorkspaceFile(data)) {
      const counts = savedGeometryCounts(data)
      return {
        kind: 'workspace', ...counts,
        vehicles: data.vehicles.length,
        objects: (data.objects || []).length,
        evidence: (data.markers || []).length,
        savedLocation: data.location,
      }
    }
    if (!location) return { error: 'Choose a location before importing GeoJSON geometry.' }
    try {
      return { kind: 'geojson', ...parseSiteGeoJSON(data, location, radius, { interpretUntyped }) }
    } catch (e) {
      if (Array.isArray(data?.elements)) {
        return { error: 'This is raw OpenStreetMap JSON, not GeoJSON. Choose a .geojson file or a ForensiTwin 3D workspace JSON.' }
      }
      return { error: e.message || String(e) }
    }
  }, [data, location?.lat, location?.lon, radius, interpretUntyped])

  async function chooseFile(event) {
    setError('')
    setData(null)
    setFilename('')
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      setError('Choose a workspace JSON or GeoJSON file smaller than 25 MB.')
      return
    }
    try {
      const parsed = JSON.parse(await file.text())
      setData(parsed)
      setFilename(file.name)
    } catch (e) {
      setError(`File could not be read as JSON: ${e.message}`)
    }
  }

  async function importData() {
    if (!preview || preview.error) return
    if (preview.kind === 'geojson' && !preview.roads.length && !preview.buildings.length) return
    setBusy(true)
    setError('')
    try {
      const store = useStore.getState()
      if (preview.kind === 'workspace') {
        // Restore the saved location, full editable scene, vehicles, evidence,
        // and the cached map geometry. This is NOT a GeoJSON import.
        await store.restore(data)
        if (useStore.getState().osm.status === 'error') {
          throw Error(useStore.getState().osm.error || 'Could not restore the saved map geometry.')
        }
        onComplete?.()
        return
      }

      const prefix = `geo-${Date.now().toString(36)}-`
      const roads = preview.roads.map((r, i) => ({ ...r, id: `${prefix}r${i}` }))
      const buildings = preview.buildings.map((b, i) => ({ ...b, id: `${prefix}b${i}` }))
      const previous = append ? store.siteLayout : { roads: [], buildings: [] }
      const layout = {
        roads: [...(previous?.roads || []), ...roads],
        buildings: [...(previous?.buildings || []), ...buildings],
        source: 'user-supplied-geojson', sourceFile: filename,
      }
      // Build directly from the supplied GeoJSON without refetching OpenStreetMap.
      // Otherwise the same mapped roads/buildings can be duplicated on import.
      const importedScene = createTracedScene(store.location, store.radius, {
        roads, buildings, source: 'user-supplied-geojson',
      })
      const previousElements = append ? (store.osm?.data?.elements || []) : []
      const combinedScene = {
        ...importedScene,
        elements: [...previousElements, ...importedScene.elements],
      }
      useStore.setState({ siteLayout: layout })
      const success = useStore.getState().loadOsmFromJson(combinedScene)
      if (!success) throw Error('The imported file contains no usable road or building geometry.')
      onComplete?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const isWorkspace = preview?.kind === 'workspace'
  const geoFeatureCount = (preview?.roads?.length || 0) + (preview?.buildings?.length || 0)
  const canImport = !!preview && !preview.error && (isWorkspace || geoFeatureCount > 0)

  return (
    <div style={backdrop} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <section role="dialog" aria-modal="true" aria-label="Import reconstruction geometry or workspace" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Import or restore 3D workspace</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...neutral, padding: '7px 10px' }}>✕</button>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '12px 0' }}>
          <b>GeoJSON (.geojson)</b> imports independently sourced roads and buildings into the current scene.
          <b> ForensiTwin workspace (.json)</b> restores the saved location, 3D scene, vehicles, evidence and settings.
        </p>

        <div style={{ background: '#e6f0f7', borderRadius: 9, padding: 13, fontSize: 12, lineHeight: 1.6, marginBottom: 13 }}>
          <b>Current accident site</b>
          <div>{location?.label || 'Location not selected'}</div>
          <div>{location?.lat?.toFixed(6)}, {location?.lon?.toFixed(6)} · {radius} m radius</div>
          <div>Current imported geometry: {siteLayout?.roads?.length || 0} roads, {siteLayout?.buildings?.length || 0} buildings</div>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>
          Choose a GeoJSON file or saved ForensiTwin workspace JSON
          <input type="file" accept=".geojson,.json,application/geo+json,application/json"
            onChange={chooseFile} style={{ display: 'block', marginTop: 6, width: '100%', fontSize: 12 }} />
        </label>

        {isWorkspace ? (
          <div style={{ background: '#edf6e8', padding: 12, borderRadius: 8, marginTop: 13, fontSize: 12, lineHeight: 1.6 }}>
            <b>Saved workspace recognised:</b> {filename}
            <div>Saved location: {preview.savedLocation?.label || `${preview.savedLocation?.lat?.toFixed(6)}, ${preview.savedLocation?.lon?.toFixed(6)}`}</div>
            <div>{preview.roads} roads · {preview.buildings} buildings · {preview.vehicles} vehicles · {preview.objects} objects · {preview.evidence} evidence markers</div>
            <div style={{ color: '#805419', marginTop: 6 }}>
              Restoring replaces your current scene. Save the current workspace first if you need it.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 9, color: '#475a68' }}>
              GeoJSON roads: <code>LineString</code> / <code>MultiLineString</code> with road-type properties.
              Buildings: <code>Polygon</code> / <code>MultiPolygon</code> with building-type properties.
              Optional properties: <code>width_m</code>, <code>height_m</code> and <code>name</code>.
            </div>
            <label style={{ display: 'flex', alignItems: 'start', gap: 8, marginTop: 10, fontSize: 12, lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={interpretUntyped} onChange={(e) => setInterpretUntyped(e.target.checked)} />
              Treat unclassified lines as roads and polygons as buildings (only for files containing exclusively surveyed geometry)
            </label>
            <label style={{ display: 'flex', alignItems: 'start', gap: 8, marginTop: 7, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} />
              Add to existing geometry instead of replacing it
            </label>
            {preview && !preview.error && (
              <div style={{ background: '#edf6e8', padding: 11, borderRadius: 8, marginTop: 13, fontSize: 12 }}>
                <b>{filename}</b>: {preview.roads.length} roads and {preview.buildings.length} buildings in the selected area.
                {preview.skipped > 0 && <span> {preview.skipped} unsupported or unclassified features skipped.</span>}
              </div>
            )}
          </>
        )}

        {(error || preview?.error) && (
          <div role="alert" style={{ padding: 10, marginTop: 12, borderRadius: 7, background: '#fff1ec', color: '#ad2913', fontSize: 12 }}>
            {error || preview.error}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          <button type="button" style={button} disabled={busy || !canImport} onClick={importData}>
            {busy ? 'Loading scene…' : isWorkspace ? 'Restore saved 3D workspace' : 'Import GeoJSON and open editable 3D'}
          </button>
          <button type="button" style={neutral} onClick={onClose}>Use live Google location</button>
          <button type="button" style={{ ...neutral, background: '#fff', border: '1px solid #c3d1da' }} onClick={onEmptyScene}>
            Open empty editing space
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#6a7680', margin: '12px 0 0', lineHeight: 1.5 }}>
          The editable geometry is derived from OpenStreetMap or investigator-supplied data, not Google Maps 3D imagery.
          Unmeasured building heights are estimates, not survey-grade evidence.
        </p>
      </section>
    </div>
  )
}