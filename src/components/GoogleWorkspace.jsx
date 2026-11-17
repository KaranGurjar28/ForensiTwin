import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, MARKER_KINDS } from '../store.js'
import { makeProjector } from '../lib/geo.js'
import { poseAt } from '../lib/physics.js'

/*
 * Google Maps 3D is the REAL-LOCATION VIEW, not a mesh source.
 * Coordinates are projected from the existing ForensiTwin convention:
 *   scene X = east metres, scene Z = south metres.
 * Vehicles, objects, and evidence stay in the same store used by the
 * separate Three.js reconstruction/simulation view.
 *
 * Models in /public/forensitwin-map-models are schematic GLBs; their
 * appearance does not assert the identity of the real incident vehicle.
 */

const MODEL_BASE = '/forensitwin-map-models/'
const MODEL_FILES = {
  hatch_s: 'hatchback.glb', hatch_m: 'hatchback.glb', sedan: 'sedan.glb',
  suv: 'suv.glb', truck: 'truck.glb', van: 'van.glb', bus: 'bus.glb',
  rickshaw: 'car.glb', moto: 'motorcycle.glb', scooter: 'scooter.glb',
  bicycle: 'bicycle.glb', pickup: 'pickup.glb', ambulance: 'ambulance.glb',
  fire_truck: 'fire.glb', tractor: 'truck.glb', person: 'person.glb',
  dog: 'dog.glb', cow: 'cow.glb', tree: 'tree.glb', building: 'building.glb',
  divider: 'divider.glb', barrier: 'barrier.glb', pole: null, cone: 'cone.glb',
  sign: null, wall: 'wall.glb',
}

const frameStyle = {
  width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
  background: '#b9c7d0', fontFamily: 'inherit',
}
const panelStyle = {
  position: 'absolute', zIndex: 5, left: 14, top: 14, maxWidth: 'min(420px, calc(100% - 28px))',
  color: '#eaf3f7', background: 'rgba(10,20,30,.9)', border: '1px solid rgba(255,255,255,.2)',
  borderRadius: 12, padding: '12px 14px', boxShadow: '0 5px 24px #0a15224d',
  pointerEvents: 'auto',
}
const buttonStyle = {
  fontSize: 12, color: '#0b1521', background: '#f6c400', border: 0,
  borderRadius: 7, padding: '8px 10px', fontWeight: 750, cursor: 'pointer',
}
const secondaryButton = {
  ...buttonStyle, background: '#f7f8fa', color: '#172533',
}
const EVIDENCE_LABELS = MARKER_KINDS
const number = (v) => Number.isFinite(Number(v)) ? Number(v) : 0
const coordinate = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)

async function getGoogleMaps() {
  if (window.google?.maps?.importLibrary) return window.google.maps
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Your Google Maps key is missing. Add VITE_GOOGLE_MAPS_API_KEY to .env.local and restart Vite.')

  // Usually the working MapPicker has already loaded Google Maps.
  // This fallback handles opening a restored case directly.
  let script = document.querySelector('script[data-ft-workspace-google]')
  if (!script) {
    script = document.createElement('script')
    script.dataset.ftWorkspaceGoogle = '1'
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&libraries=maps3d`
    document.head.appendChild(script)
  }
  if (!window.google?.maps?.importLibrary) {
    await new Promise((resolve, reject) => {
      script.addEventListener('load', resolve, { once: true })
      script.addEventListener('error', () => reject(new Error('Could not load Google Maps JavaScript API.')), { once: true })
    })
  }
  if (!window.google?.maps?.importLibrary) throw new Error('Google Maps loaded without the required 3D API.')
  return window.google.maps
}

function itemPosition(projector, x, z, altitude = 0) {
  const [lat, lng] = projector.toGeo(number(x), number(z))
  return { lat, lng, altitude }
}

function withinRadius(projector, lat, lng, radius) {
  const [x, z] = projector.toLocal(lat, lng)
  return Math.hypot(x, z) <= radius * 1.05
}

export default function GoogleWorkspace() {
  const host = useRef(null)
  const mapRef = useRef(null)
  const apiRef = useRef(null)
  const elementsRef = useRef(new Map())
  const moveRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [moveSelected, setMoveSelected] = useState(false)
  const [mode, setMode] = useState('HYBRID')

  const location = useStore((s) => s.location)
  const radius = useStore((s) => s.radius)
  const vehicles = useStore((s) => s.vehicles)
  const objects = useStore((s) => s.objects)
  const markers = useStore((s) => s.markers)
  const selectedId = useStore((s) => s.selectedId)
  const placing = useStore((s) => s.placing)
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const tMin = useStore((s) => s.tMin)
  const tMax = useStore((s) => s.tMax)
  const siteLayout = useStore((s) => s.siteLayout)

  const projector = useMemo(() => location && makeProjector(location.lat, location.lon), [location?.lat, location?.lon])

  useEffect(() => { moveRef.current = moveSelected }, [moveSelected])

  // Real-map preview uses the same kinematic timeline as the simulation.
  // Geometry remains illustrative; this does not infer a surveyed trajectory.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let previous = 0
    const step = (now) => {
      if (previous === 0) previous = now
      const elapsed = Math.min(0.08, (now - previous) / 1000)
      previous = now
      const state = useStore.getState()
      const next = Math.min(state.tMax, state.time + elapsed * state.rate)
      if (next >= state.tMax) useStore.setState({ time: state.tMax, playing: false })
      else { useStore.setState({ time: next }); raf = requestAnimationFrame(step) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    if (!location || !host.current || !coordinate({ lat: location.lat, lng: location.lon })) return
    let alive = true
    setError('')
    setReady(false)

    getGoogleMaps().then((maps) => maps.importLibrary('maps3d')).then((maps3d) => {
      if (!alive || !host.current) return
      apiRef.current = maps3d
      const map = new maps3d.Map3DElement({
        center: { lat: location.lat, lng: location.lon, altitude: 0 },
        range: Math.max(650, Math.min(4200, radius * 1.85)),
        tilt: 58,
        heading: 0,
        mode: maps3d.MapMode?.HYBRID || 'HYBRID',
        defaultUIHidden: false,
        gestureHandling: 'COOPERATIVE',
      })
      map.style.width = '100%'
      map.style.height = '100%'
      map.style.display = 'block'
      map.addEventListener('gmp-error', () => {
        if (alive) setError('Google Maps could not render the selected location. Check your API key, billing and connection.')
      })
      map.addEventListener('gmp-click', (event) => {
        const point = event?.position
        if (!point || !coordinate({ lat: +point.lat, lng: +point.lng })) return
        const s = useStore.getState()
        const proj = makeProjector(s.location.lat, s.location.lon)
        const lat = number(point.lat), lng = number(point.lng)
        if (!withinRadius(proj, lat, lng, s.radius)) {
          setError('This point is outside the reconstruction radius. Move closer to the pinned accident area or increase the radius.')
          return
        }
        const [x, z] = proj.toLocal(lat, lng)
        if (s.placing) {
          s.addMarker(s.placing, Number(x.toFixed(2)), Number(z.toFixed(2)))
          setError('')
          return
        }
        if (moveRef.current && s.selectedId) {
          if (s.vehicles.some((v) => v.id === s.selectedId)) {
            s.updateVehicle(s.selectedId, { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)) })
          } else if (s.objects.some((v) => v.id === s.selectedId)) {
            s.updateObject(s.selectedId, { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)) })
          }
          moveRef.current = false
          setMoveSelected(false)
          setError('')
        }
      })
      host.current.replaceChildren(map)
      mapRef.current = map
      setReady(true)
    }).catch((e) => { if (alive) setError(e?.message || String(e)) })

    return () => {
      alive = false
      for (const pair of elementsRef.current.values()) {
        pair.model?.remove()
        pair.marker?.remove()
      }
      elementsRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
      apiRef.current = null
    }
    // A different location remounts the Google map. Zoom changes are handled separately.
  }, [location?.lat, location?.lon])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    mapRef.current.range = Math.max(650, Math.min(4200, radius * 1.85))
  }, [radius, ready])

  const items = useMemo(() => [
    ...vehicles.map((v) => {
      const pose = poseAt(v, time)
      return {
        id: `v:${v.id}`, type: 'vehicle', dataId: v.id, name: v.name || 'Vehicle',
        model: MODEL_FILES[v.type] || 'car.glb',
        x: pose.x, z: pose.z, heading: pose.bearing ?? v.heading ?? 0,
        color: v.color || '#f6c400', selected: v.id === selectedId,
      }
    }),
    ...objects.map((v) => ({
      id: `o:${v.id}`, type: 'object', dataId: v.id,
      name: v.name || v.type || 'Object', model: MODEL_FILES[v.type] ?? null,
      x: v.x, z: v.z, heading: v.heading || 0, color: v.color || '#b3c8d6', selected: v.id === selectedId,
    })),
    ...markers.map((m) => ({
      id: `e:${m.id}`, type: 'evidence', dataId: m.id,
      name: `E${m.n ?? '?'} ${EVIDENCE_LABELS[m.kind] || m.kind || 'Evidence'}`,
      model: null, x: m.x, z: m.z, heading: 0,
      color: '#f6c400', selected: false,
    })),
  ], [vehicles, objects, markers, selectedId, time])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!ready || !map || !api || !projector) return
    const old = elementsRef.current
    const seen = new Set()

    for (const item of items) {
      seen.add(item.id)
      let pair = old.get(item.id)
      const label = item.selected ? `● ${item.name}` : item.name
      const position = itemPosition(projector, item.x, item.z)
      if (!pair) {
        let model = null
        if (item.model && api.Model3DElement) {
          try {
            model = new api.Model3DElement({
              src: `${MODEL_BASE}${item.model}`,
              position,
              orientation: { heading: number(item.heading), tilt: 0, roll: 0 },
              scale: 1,
              altitudeMode: 'CLAMP_TO_GROUND',
            })
            map.append(model)
          } catch (e) {
            console.warn('3D model could not be placed; keeping its locator marker.', e)
          }
        }
        const Marker = api.Marker3DInteractiveElement || api.Marker3DElement
        const marker = new Marker({
          position: itemPosition(projector, item.x, item.z, item.type === 'evidence' ? 1.1 : 1.6),
          label,
          extruded: true,
          drawsWhenOccluded: true,
          sizePreserved: true,
          zIndex: item.selected ? 30 : item.type === 'evidence' ? 20 : 10,
        })
        if (api.Marker3DInteractiveElement) {
          marker.addEventListener('gmp-click', (event) => {
            // Do not send a marker click into ground placement/movement.
            event.stopPropagation?.()
            const s = useStore.getState()
            if (item.type === 'evidence') s.setTab('evidence')
            else { s.select(item.dataId); s.setTab('vehicles') }
          })
        }
        map.append(marker)
        pair = { model, marker, modelFile: item.model, id: item.id }
        old.set(item.id, pair)
      }
      if (pair.modelFile !== item.model) {
        pair.model?.remove()
        pair.model = null
        pair.modelFile = item.model
        if (item.model && api.Model3DElement) {
          try {
            pair.model = new api.Model3DElement({
              src: `${MODEL_BASE}${item.model}`, position,
              orientation: { heading: number(item.heading), tilt: 0, roll: 0 },
              scale: 1, altitudeMode: 'CLAMP_TO_GROUND',
            })
            map.append(pair.model)
          } catch (e) { console.warn('Model update failed:', e) }
        }
      }
      pair.marker.position = itemPosition(projector, item.x, item.z, item.type === 'evidence' ? 1.1 : 1.6)
      pair.marker.label = label
      pair.marker.zIndex = item.selected ? 30 : item.type === 'evidence' ? 20 : 10
      if (pair.model) {
        pair.model.position = position
        pair.model.orientation = { heading: number(item.heading), tilt: 0, roll: 0 }
      }
    }
    for (const [id, pair] of old) {
      if (!seen.has(id)) {
        pair.model?.remove()
        pair.marker?.remove()
        old.delete(id)
      }
    }
  }, [items, ready, projector])

  // Investigator-authored overlays only. The underlying Google map supplies
  // visual context, not editable basemap geometry.
  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || !ready) return
    const paths = []
    const attach = (element) => { map.append(element); paths.push(element) }
    for (const road of siteLayout?.roads || []) {
      if (api.Polyline3DElement && (road.points || []).length >= 2) {
        try {
          attach(new api.Polyline3DElement({
            path: road.points.map((p) => ({ lat: +p.lat, lng: +p.lng, altitude: 0 })),
            altitudeMode: 'RELATIVE_TO_GROUND', strokeColor: '#00dcff',
            strokeWidth: 6, drawsOccludedSegments: true,
          }))
        } catch (e) { console.warn('Road sketch not displayed:', e) }
      }
    }
    for (const building of siteLayout?.buildings || []) {
      if (api.Polygon3DElement && (building.points || []).length >= 3) {
        try {
          attach(new api.Polygon3DElement({
            path: building.points.map((p) => ({ lat: +p.lat, lng: +p.lng, altitude: 0 })),
            altitudeMode: 'RELATIVE_TO_GROUND', fillColor: '#ffd44955',
            strokeColor: '#ffd449', strokeWidth: 3, drawsOccludedSegments: true,
          }))
        } catch (e) { console.warn('Building sketch not displayed:', e) }
      }
    }
    return () => paths.forEach((path) => path.remove())
  }, [siteLayout, ready])

  const focus = useCallback(() => {
    if (!mapRef.current || !location) return
    mapRef.current.flyCameraTo?.({
      endCamera: { center: { lat: location.lat, lng: location.lon, altitude: 0 },
        range: Math.max(650, Math.min(4200, radius * 1.6)), tilt: 58, heading: 0 },
      durationMillis: 900,
    })
  }, [location?.lat, location?.lon, radius])

  const selectMode = (m) => {
    setMode(m)
    if (mapRef.current) mapRef.current.mode = m
  }

  const cancel = () => { setMoveSelected(false); useStore.getState().setPlacing(null) }

  return <div style={frameStyle}>
    <div ref={host} style={{ width: '100%', height: '100%' }} aria-label="Google 3D real-location reconstruction map" />
    {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#dce4e8', color: '#172533', padding: 22, textAlign: 'center' }}>
      {error || 'Loading real accident location in Google Maps 3D…'}
    </div>}
    <div style={panelStyle}>
      <div style={{ fontSize: 11, fontWeight: 850, color: '#f6c400', letterSpacing: '.055em' }}>REAL LOCATION · GOOGLE MAPS 3D</div>
      <div style={{ fontSize: 13, fontWeight: 750, marginTop: 6, overflowWrap: 'anywhere' }}>
        {location?.label || `${location?.lat?.toFixed(5)}, ${location?.lon?.toFixed(5)}` || 'No location'}
      </div>
      <div style={{ color: '#c0d0df', fontSize: 11, marginTop: 4 }}>
        {location?.lat?.toFixed(6)}, {location?.lon?.toFixed(6)} · {radius} m radius
        <div>{vehicles.length} vehicles · {objects.length} objects · {markers.length} evidence markers</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        <button type="button" style={secondaryButton} onClick={focus} disabled={!ready}>Focus location</button>
        <button type="button" style={secondaryButton} onClick={() => selectMode(mode === 'HYBRID' ? 'ROADMAP' : 'HYBRID')} disabled={!ready}>
          {mode === 'HYBRID' ? 'Roadmap' : 'Satellite'}
        </button>
        {selectedId && <button type="button" style={moveSelected ? buttonStyle : secondaryButton} onClick={() => setMoveSelected((v) => !v)}>
          {moveSelected ? 'Moving selected…' : 'Move selected here'}
        </button>}
        {(moveSelected || placing) && <button type="button" style={secondaryButton} onClick={cancel}>Cancel placement</button>}
      </div>
      <div style={{ fontSize: 11, marginTop: 9, lineHeight: 1.45, color: '#c1d0dc' }}>
        {placing ? 'Click the map to place the selected evidence marker.' : moveSelected ? 'Click the real-world map to reposition the selected vehicle or object.' :
          'Use Vehicles or Evidence to add scene items. Select an item, then choose “Move selected here” to place it on the actual site.'}
      </div>
      {vehicles.length > 0 && <div style={{ borderTop: '1px solid #ffffff3b', paddingTop: 9, marginTop: 9 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#dce7ee' }}>Incident replay on the actual map · {time < 0 ? 'T' : 'T+'}{time.toFixed(1)} s</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <button type="button" style={buttonStyle} onClick={() => {
            const state = useStore.getState()
            if (state.playing) useStore.setState({ playing: false })
            else useStore.setState({ time: state.tMin, playing: true })
          }}>{playing ? 'Pause' : 'Replay'}</button>
          <input aria-label="Accident replay time" type="range" min={tMin} max={tMax} step="0.1" value={time}
            style={{ flex: 1, minWidth: 85 }} onChange={(e) => useStore.getState().setTime(Number(e.target.value))} />
        </div>
      </div>}
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#ffc0b7' }}>{error}</div>}
    </div>
    <div style={{ position: 'absolute', right: 14, bottom: 16, maxWidth: 350,
      background: 'rgba(10,20,30,.83)', borderRadius: 8, padding: '7px 10px', color: '#eff5f8', fontSize: 11,
      pointerEvents: 'none', zIndex: 3 }}>
      Google map imagery is a site reference; the models are illustrative. Physics and editable damage remain in Simulation 3D.
    </div>
  </div>
}