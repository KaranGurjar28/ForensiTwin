import { create } from 'zustand'
import { createTracedScene, emptySiteLayout, clampRadius } from './lib/googleScene.js'
import { fetchReconstructionGeometry, geometryCounts, usableGeometry } from './lib/reconstructionData.js'
import { makeFlatSampler, gradeAt } from './lib/elevation.js'
import { CATALOG, speedFor } from './lib/catalog.js'
import { wrap360 } from './lib/geo.js'

const uid = () => Math.random().toString(36).slice(2, 8)
let loadToken = 0

export const DEFAULT_ENV = {
  hour: 14.5, weather: 'clear', visibility: 600, greenery: 0.6,
}
export const DEFAULT_LAYERS = {
  buildings: true, trees: true, grid: true, labels: true, paths: true, skids: true, terrain: true,
}

export const MARKER_KINDS = {
  blood: 'Blood trace', hair: 'Hair', fibre: 'Fibre', paint: 'Paint transfer',
  debris: 'Debris', gouge: 'Gouge mark', skid: 'Skid mark', yaw: 'Yaw mark', scrub: 'Scrub / tyre skip mark',
  tyre: 'Tyre print', rest: 'Rest position', impact: 'Point of impact', glass: 'Broken glass', fluid: 'Fluid leak',
  seatbelt: 'Seat-belt evidence', airbag: 'Airbag evidence', cctv: 'CCTV camera', witness: 'Witness', photo: 'Photo point', other: 'Other',
}

export function makeVehicle(type, index = 0, over = {}) {
  const s = CATALOG[type]
  const heading = [0, 90, 180, 270][index % 4]
  return {
    id: uid(),
    type,
    name: `V${index + 1}`,
    color: s.color,
    licensePlate: '',
    vin: '',
    speedometerKmh: '',
    occupantCount: type === 'bicycle' ? 1 : (['moto', 'scooter', 'rickshaw'].includes(type) ? 1 : 2),
    x: index === 0 ? 0 : (index % 2 ? 1 : -1) * (5 + index * 2),
    z: index === 0 ? 0 : 0,
    heading,
    crush: 0,
    impactOffset: 0,
    damageZone:'front',
    mass: s.mass,
    speed: speedFor(type),
    skid: 0,
    mu: 0.7,
    postDist: 0,
    postDir: heading,
    ...over,
  }
}

export const useStore = create((set, get) => ({
  // ---- navigation
  view: 'map',
  setView: (view) => set({ view }),
  tab: 'scene',
  setTab: (tab) => set({ tab }),
  mapView: { center: [23.0225, 72.5714], zoom: 13 },

  // ---- Google-only geographic reference and *manually traced* editable scene.
  location: null,
  radius: 800,
  siteLayout: emptySiteLayout(),
  setRadius: (radius) => set({ radius: clampRadius(radius) }),
  setLocation: (loc) => set((s) => {
    const prev = s.location
    const changed = prev && (Math.abs((+prev.lat || 0) - (+loc.lat || 0)) > 1e-6 || Math.abs((+prev.lon || 0) - (+loc.lon || 0)) > 1e-6)
    return { location: { ...prev, ...loc }, ...(changed ? { siteLayout: emptySiteLayout() } : {}) }
  }),
  addSiteFeature: (kind, feature) => set((s) => ({ siteLayout: {
    ...s.siteLayout,
    [kind]: [...(s.siteLayout?.[kind] || []), { id: uid(), ...feature }],
  } })),
  removeSiteFeature: (kind, id) => set((s) => ({ siteLayout: {
    ...s.siteLayout,
    [kind]: (s.siteLayout?.[kind] || []).filter((v) => v.id !== id),
  } })),
  clearSiteLayout: () => set({ siteLayout: emptySiteLayout() }),
  osm: { status:'idle', data:null, error:null, note:'', loadedKey:null, origin:null },
  worldStats: null,
  sceneId: 0,
  terrain: makeFlatSampler(),
  terrainStatus: 'unavailable',
  heightAt: (x,z) => get().terrain(x,z),
  gradeAt: (x,z,bearing) => gradeAt(get().terrain,x,z,bearing),
  loadOsm: async ({ preserve = false, forceRefresh = false } = {}) => {
    const { location, radius, siteLayout } = get()
    if (!location || !Number.isFinite(+location.lat) || !Number.isFinite(+location.lon)) {
      set(s => ({ osm: { ...s.osm, status: 'error', error: 'Select an accident location first.' } }))
      return false
    }
    const token = ++loadToken
    const r = clampRadius(radius)
    const key = `${(+location.lat).toFixed(5)},${(+location.lon).toFixed(5)},${r}`
    const changedPlace = !!get().osm.origin && (
      Math.abs((get().osm.origin.lat ?? 0) - location.lat) > 1e-6 ||
      Math.abs((get().osm.origin.lon ?? 0) - location.lon) > 1e-6
    )
    set(s => ({ osm: { ...s.osm, status: 'loading', error: null, note: 'Finding mapped roads and building footprints...' } }))
    try {
      let incoming = null
      let source = ''
      let cached = false
      let partial = false
      try {
        const result = await fetchReconstructionGeometry(location.lat, location.lon, r, {
          forceRefresh,
          onStatus: note => { if (token === loadToken) set(s => ({ osm: { ...s.osm, note } })) },
        })
        incoming = result.data
        source = result.source
        cached = result.cached
        partial = !!result.partial
      } catch (networkError) {
        // Import files and manually measured features still work without Overpass.
        const manualScene = createTracedScene(location, r, siteLayout)
        if (!usableGeometry(manualScene)) throw networkError
        incoming = manualScene
        source = 'Investigator-supplied scene only (network unavailable)'
      }
      if (token !== loadToken) return false
      const ownScene = createTracedScene(location, r, siteLayout)
      const fromOwn = usableGeometry(ownScene) ? ownScene.elements.map((el, i) => ({ ...el, id: -10000000 - i })) : []
      const data = { ...incoming, elements: [...incoming.elements, ...fromOwn] }
      const counts = geometryCounts(data)
      set(s => ({
        osm: {
          status: 'ready', data, error: null,
          note: `${partial ? 'PARTIAL MAP — some tiles unavailable. ' : 'Ready: '}${counts.roads} road segments and ${counts.buildings} building footprints (${source}${cached ? ', cached' : ''}).`,
          loadedKey: key, mirror: source, cached, partial,
          origin: { lat: location.lat, lon: location.lon, radius: r, source },
        },
        sceneId: s.sceneId + 1, view: 'scene',
        worldStats: null,
        tab: s.tab === 'scene' ? 'vehicles' : s.tab,
        terrain: makeFlatSampler(), terrainStatus: 'unavailable',
        ...(changedPlace && !preserve ? { vehicles: [], objects: [], selectedId: null, labelEvent: null, markers: [], evidenceAssessment: {}, cameraFootage: [], time: 0, playing: false } : {}),
      }))
      return true
    } catch (err) {
      if (token !== loadToken) return false
      set(s => ({ osm: { ...s.osm, status: 'error', error: String(err.message || err), note: '' } }))
      return false
    }
  },
  cancelLoad: () => { loadToken++; set(s => ({ osm: { ...s.osm, status: s.osm.data ? 'ready' : 'idle', note: '' } })) },
  // Existing local OSM / Overpass JSON files can be imported as a fallback.
  loadOsmFromJson: (json) => {
    const { location, radius } = get()
    if (!location || !usableGeometry(json)) {
      set(s => ({ osm: { ...s.osm, status: 'error', error: 'Expected Overpass JSON containing way geometries.', note: '' } }))
      return false
    }
    const r = clampRadius(radius)
    const counts = geometryCounts(json)
    set(s => ({ osm: {
      status: 'ready', data: json, error: null, partial: false,
      note: `Imported: ${counts.roads} roads and ${counts.buildings} building footprints`,
      loadedKey: `${(+location.lat).toFixed(5)},${(+location.lon).toFixed(5)},${r}`,
      origin: { lat: location.lat, lon: location.lon, radius: r, source: 'User-provided OSM JSON' },
      mirror: 'User-provided OSM JSON', cached: true,
    }, sceneId: s.sceneId + 1, view: 'scene' }))
    return true
  },

  // ---- scene settings
  env: DEFAULT_ENV,
  setEnv: (p) => set((s) => ({ env: { ...s.env, ...p } })),
  layers: DEFAULT_LAYERS,
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  cameraMode: 'orbit',
  setCameraMode: (cameraMode) => set({ cameraMode }),

  // ---- road vehicles and non-vehicle scene objects
  vehicles: [],
  objects: [],
  selectedId: null,
  labelEvent: null, // transient label notification, including repeat-click on the same object
  gizmo: 'translate',
  setGizmo: (gizmo) => set({ gizmo }),
  flashLabel: (id) => set((s) => ({ labelEvent: { id, seq: (s.labelEvent?.seq || 0) + 1 } })),
  select: (selectedId) => set((s) => ({
    selectedId,
    labelEvent: selectedId ? { id: selectedId, seq: (s.labelEvent?.seq || 0) + 1 } : null,
  })),
  editDamageOnClick: false,
  setEditDamageOnClick: (editDamageOnClick) => set({ editDamageOnClick }),

  addVehicle: (type) => {
    const spec = CATALOG[type]
    if (!spec || spec.category !== 'vehicle') return
    const vs = get().vehicles
    const v = makeVehicle(type, vs.length + get().objects.length, {
      name: `V${vs.length + 1}`,
      licensePlate: '',
      vin: '',
      speedometerKmh: '',
    })
    set((s) => ({ vehicles: [...vs, v], selectedId: v.id, tab: 'vehicles',
      labelEvent: { id: v.id, seq: (s.labelEvent?.seq || 0) + 1 } }))
  },
  updateVehicle: (id, patch) => set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  changeType: (id, type) => {
    const spec = CATALOG[type]
    const current = get().vehicles.find((v) => v.id === id)
    if (!spec || spec.category !== 'vehicle' || !current) return
    get().updateVehicle(id, {
      type, color: spec.color, mass: spec.mass,
      speed: current.speed ?? speedFor(type),
      damageZone: current.damageZone || 'front',
      crush: spec.noCrush ? 0 : current.crush ?? 0,
      licensePlate: current.licensePlate ?? '',
      vin: current.vin ?? '',
      speedometerKmh: current.speedometerKmh ?? '',
    })
  },
  removeVehicle: (id) => set((s) => ({ vehicles: s.vehicles.filter((v) => v.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
  duplicateVehicle: (id) => {
    const src = get().vehicles.find((v) => v.id === id)
    if (!src) return
    const n = get().vehicles.length + 1
    const v = {
      ...src, id: uid(), name: `V${n}`,
      // Identity values are never copied to a duplicate.
      licensePlate: '', vin: '', speedometerKmh: '',
      x: src.x + 4, z: src.z + 3,
    }
    set((s) => ({ vehicles: [...s.vehicles, v], selectedId: v.id,
      labelEvent: { id: v.id, seq: (s.labelEvent?.seq || 0) + 1 } }))
  },

  addObject: (type) => {
    const spec = CATALOG[type]
    if (!spec || spec.category === 'vehicle') return
    const objects = get().objects
    const count = objects.filter((item) => item.type === type).length + 1
    const v = makeVehicle(type, objects.length + get().vehicles.length, {
      name: `${spec.label} ${count}`,
      posture: spec.category === 'person' ? 'standing' : 'standing', postCrashPosture:'standing',
      speed: 0, skid: 0, postDist: 0, mass: 0,
      crush: 0, licensePlate: '', vin: '', speedometerKmh: '',
    })
    set((s) => ({ objects: [...objects, v], selectedId: v.id, tab: 'vehicles',
      labelEvent: { id: v.id, seq: (s.labelEvent?.seq || 0) + 1 } }))
  },
  updateObject: (id, patch) => set((s) => ({ objects: s.objects.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  changeObjectType: (id, type) => {
    const spec = CATALOG[type]
    const current = get().objects.find((v) => v.id === id)
    if (!spec || spec.category === 'vehicle' || !current) return
    get().updateObject(id, { type, color: spec.color, mass: 0, speed: 0, skid: 0, postDist: 0, crush: 0 })
  },
  removeObject: (id) => set((s) => ({ objects: s.objects.filter((v) => v.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
  duplicateObject: (id) => {
    const src = get().objects.find((v) => v.id === id)
    if (!src) return
    const n = get().objects.filter((item) => item.type === src.type).length + 1
    const v = { ...src, id: uid(), name: `${CATALOG[src.type]?.label ?? 'Object'} ${n}`, x: src.x + 2, z: src.z + 2 }
    set((s) => ({ objects: [...s.objects, v], selectedId: v.id,
      labelEvent: { id: v.id, seq: (s.labelEvent?.seq || 0) + 1 } }))
  },
  nudgeHeading: (id, d) => {
    const vehicle = get().vehicles.find((v) => v.id === id)
    if (vehicle) return get().updateVehicle(id, { heading: wrap360(vehicle.heading + d) })
    const object = get().objects.find((v) => v.id === id)
    if (object) return get().updateObject(id, { heading: wrap360(object.heading + d) })
  },

  // ---- structured accident evidence register (case-persistent)
  evidenceAssessment: {},
  updateEvidenceField: (fieldId, entry) => set((s) => ({ evidenceAssessment: { ...s.evidenceAssessment, [fieldId]: entry } })),

  // Verified evidence: frames are extracted from a user-supplied local CCTV file.
  // Actual video bytes cannot be saved inside case JSON; filename and still frames can.
  cameraFootage: [],
  addCameraFootage: (entry) => set((s) => ({ cameraFootage: [...s.cameraFootage, { id:uid(), ...entry }] })),
  removeCameraFootage: (id) => set((s) => ({ cameraFootage: s.cameraFootage.filter((m) => m.id !== id) })),
  updateCameraFootage: (id, patch) => set((s) => ({ cameraFootage: s.cameraFootage.map((m) => m.id === id ? { ...m, ...patch } : m) })),

  // ---- evidence markers
  markers: [],
  placing: null, // marker kind currently being placed, or null
  setPlacing: (placing) => set({ placing, tool: placing ? 'marker' : get().tool === 'marker' ? 'select' : get().tool }),
  addMarker: (kind, x, z) => set((s) => {
    const id = uid()
    return {
      markers: [...s.markers, { id, kind, x, z, n: s.markers.length + 1, note: '', photo: null }],
      labelEvent: { id, seq: (s.labelEvent?.seq || 0) + 1 },
    }
  }),
  updateMarker: (id, p) => set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...p } : m)) })),
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id).map((m, i) => ({ ...m, n: i + 1 })),
  })),

  // ---- measuring ruler
  tool: 'select', // 'select' | 'marker' | 'ruler'
  ruler: [], // 0, 1, or 2 {x,z} points
  setTool: (tool) => set({ tool, placing: tool === 'marker' ? get().placing : null, ruler: [] }),
  addRulerPoint: (x, z) => set((s) => {
    if (s.ruler.length >= 2) return { ruler: [{ x, z }] }
    return { ruler: [...s.ruler, { x, z }] }
  }),
  clearRuler: () => set({ ruler: [] }),

  // ---- physics settings
  physics: { pair:null, e:0.25, normalDeg:null, grade:0, eff:1, collisionType:'vehicle_vehicle_head_on', primaryVehicleId:'', collisionTargetKind:'vehicle', collisionTargetId:'', impactAngleDeg:0, impactSequence:'primary' },
  setPhysics: (p) => set((s) => ({ physics: { ...s.physics, ...p } })),

  // ---- playback
  time: 0,
  playing: false,
  rate: 1,
  tMin: -4,
  tMax: 5,
  setTime: (time) => set({ time, playing: false }),
  setPlaying: (playing) => set((s) => ({ playing, time: playing && s.time >= s.tMax ? s.tMin : s.time })),
  setRate: (rate) => set({ rate }),

  // ---- case file
  caseInfo: { number: '', investigator: '', notes: '' },
  setCaseInfo: (p) => set((s) => ({ caseInfo: { ...s.caseInfo, ...p } })),

  // ---- bridge to the WebGL canvas (set by <Bridge/> inside the Canvas)
  snapshotFn: null,
  screenshotFn: null,
  videoFrameFn: null,

  // ---- persistence
  // Unlike the small case-file snapshot, workspace export retains the complete
  // OSM/vector-tile geometry so a restored scene works without refetching.
  serializeWorkspace: () => {
    const s = get()
    const snapshot = s.osm.data || (s.location ? createTracedScene(s.location, s.radius, s.siteLayout) : null)
    const origin = s.osm.origin || (s.location ? {
      lat: Number(s.location.lat), lon: Number(s.location.lon), radius: s.radius,
      source: 'Investigator-traced workspace',
    } : null)
    return {
      ...s.serialize(),
      version: 5,
      fileType: 'ForensiTwin Editable 3D Workspace',
      mapSnapshot: snapshot,
      mapOrigin: origin,
    }
  },
  serialize: () => {
    const s = get()
    return {
      version: 4,
      // Small geographic snapshots keep saved cases reproducible without networking.
      mapSnapshot: s.osm.data && JSON.stringify(s.osm.data).length < 10_000_000 ? s.osm.data : null,
      mapOrigin: s.osm.origin,
      location: s.location, radius: s.radius, siteLayout: s.siteLayout, cameraFootage: s.cameraFootage,
      vehicles: s.vehicles, objects: s.objects, markers: s.markers, evidenceAssessment: s.evidenceAssessment,
      env: s.env, layers: s.layers, caseInfo: s.caseInfo, physics: s.physics,
    }
  },
  restore: (d) => {
    const savedItems = d.vehicles ?? []
    const legacyObjects = savedItems.filter((item) => CATALOG[item.type]?.category !== 'vehicle')
    const savedVehicles = savedItems.filter((item) => CATALOG[item.type]?.category === 'vehicle')
    set({
      location: d.location, radius: clampRadius(d.radius ?? 800), siteLayout: d.siteLayout ?? emptySiteLayout(),
      cameraFootage: d.cameraFootage ?? [],
      vehicles: savedVehicles,
      objects: [...(d.objects ?? []), ...legacyObjects],
      markers: (d.markers ?? []).map((m, i) => ({ ...m, n: m.n ?? i + 1 })), evidenceAssessment: d.evidenceAssessment ?? {},
      env: { ...DEFAULT_ENV, ...d.env }, layers: { ...DEFAULT_LAYERS, ...d.layers },
      caseInfo: d.caseInfo ?? { number: '', investigator: '', notes: '' },
      physics: { pair:null, e:0.25, normalDeg:null, grade:0, eff:1, collisionType:'vehicle_vehicle_head_on', primaryVehicleId:'', collisionTargetKind:'vehicle', collisionTargetId:'', impactAngleDeg:0, impactSequence:'primary', ...d.physics },
      selectedId: null, labelEvent: null, time: 0, playing: false, tool: 'select', ruler: [],
    })
    // When saved geometry is included, restore that EXACT site before querying
    // a mutable public map. A cached map is never silently swapped to another site.
    if (usableGeometry(d.mapSnapshot) && d.mapOrigin &&
      Math.abs((+d.mapOrigin.lat || 0) - (+d.location?.lat || 0)) < 1e-6 &&
      Math.abs((+d.mapOrigin.lon || 0) - (+d.location?.lon || 0)) < 1e-6) {
      const r = clampRadius(d.radius ?? 800)
      const counts = geometryCounts(d.mapSnapshot)
      set(s => ({ osm: { status: 'ready', data: d.mapSnapshot, error: null,
        note: `Saved site restored: ${counts.roads} roads, ${counts.buildings} buildings`,
        loadedKey: `${(+d.location.lat).toFixed(5)},${(+d.location.lon).toFixed(5)},${r}`,
        origin: { ...d.mapOrigin, radius: r }, mirror: 'Saved case snapshot', cached: true,
      }, sceneId: s.sceneId + 1, view: 'scene' }))
      return Promise.resolve(true)
    }
    set(s => ({ osm: { status: 'idle', data: null, error: null, note: '', loadedKey: null, origin: null } }))
    return get().loadOsm({ preserve: true })
  },
}))