import { create } from 'zustand'
import { fetchOsm } from './lib/overpass.js'
import { fetchElevation, makeFlatSampler, gradeAt } from './lib/elevation.js'
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
  debris: 'Debris / fragments',
  gouge: 'Gouge mark',
  yaw: 'Yaw mark',
  scrub: 'Scrub / tyre skip mark',
  skid: 'Skid mark',
  tyre: 'Tyre print',
  paint: 'Paint chip / transfer',
  blood: 'Blood evidence',
  bio: 'Other biological trace',
  fibre: 'Fibre evidence',
  hair: 'Hair evidence',
  glass: 'Broken glass',
  fluid: 'Fluid leak',
  seatbelt: 'Seat-belt evidence',
  airbag: 'Airbag evidence',
  impact: 'Point of impact',
  rest: 'Final rest position',
  witness: 'Witness location',
  cctv: 'CCTV / camera location',
  photo: 'Photo point',
  other: 'Other evidence',
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
    occupantCount: 0,
    occupantDetails: [],
    posture: 'upright',
    postImpactPosture: 'prone-front',
    postImpactDistance: 2.5,
    postImpactHeading: heading,
    damageSide: 'front',
    x: index === 0 ? 0 : (index % 2 ? 1 : -1) * (5 + index * 2),
    z: index === 0 ? 0 : 0,
    heading,
    crush: 0,
    impactOffset: 0,
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

  // ---- location + OSM
  location: null,
  radius: 800,
  setRadius: (radius) => set({ radius }),
  setLocation: (loc) => set((s) => ({ location: { ...s.location, ...loc } })),
  osm: { status: 'idle', data: null, error: null, note: '', loadedKey: null, origin: null },
  worldStats: null,
  sceneId: 0,

  // ---- terrain (elevation sampler; not persisted, not serialized)
  terrain: makeFlatSampler(),
  terrainStatus: 'idle', // idle | loading | ready | unavailable
  heightAt: (x, z) => get().terrain(x, z),
  gradeAt: (x, z, bearing) => gradeAt(get().terrain, x, z, bearing),

  loadOsm: async ({ preserve = false } = {}) => {
    const { location, radius } = get()
    if (!location) return
    const token = ++loadToken
    const key = `${location.lat.toFixed(5)},${location.lon.toFixed(5)},${radius}`
    set((s) => ({ osm: { ...s.osm, status: 'loading', error: null, note: 'Contacting Overpass…' } }))
    try {
      const { json, mirror, cached } = await fetchOsm(location.lat, location.lon, radius, {
        onStatus: (note) => token === loadToken && set((s) => ({ osm: { ...s.osm, note } })),
      })
      if (token !== loadToken) return
      const changed = get().osm.loadedKey !== key
      set((s) => ({
        osm: { status: 'ready', data: json, error: null, note: '', mirror, cached, loadedKey: key, origin: { lat: location.lat, lon: location.lon, radius } },
        sceneId: s.sceneId + 1,
        view: 'scene',
        tab: s.tab === 'scene' && changed ? 'vehicles' : s.tab,
        ...(changed && !preserve ? { vehicles: [], objects: [], selectedId: null, markers: [], evidenceAssessment: {}, time: 0, playing: false } : {}),
      }))

      // Terrain is best-effort and loads independently of OSM geometry —
      // a slow or failed elevation fetch never blocks the 3D scene.
      set({ terrainStatus: 'loading' })
      fetchElevation(location.lat, location.lon, radius).then((sampler) => {
        if (token !== loadToken) return
        set({ terrain: sampler, terrainStatus: sampler.available ? 'ready' : 'unavailable' })
      })
      } catch (e) {
      if (token !== loadToken) return
      set((s) => ({ osm: { ...s.osm, status: 'error', error: String(e.message || e), note: '' } }))
    }
  },
  cancelLoad: () => { loadToken++; set((s) => ({ osm: { ...s.osm, status: s.osm.data ? 'ready' : 'idle', note: '' } })) },

  // Loads a scene from Overpass JSON the user obtained themselves (e.g. ran
  // the query on overpass-turbo.eu and pasted/uploaded the result) — a
  // manual path that works regardless of whether any mirror is reachable
  // from this app right now.
  loadOsmFromJson: (json) => {
    const { location, radius } = get()
    if (!location) return
    if (!json || !Array.isArray(json.elements)) {
      set((s) => ({ osm: { ...s.osm, status: 'error', error: 'That doesn\'t look like Overpass JSON — expected an "elements" array.', note: '' } }))
      return
    }
    const token = ++loadToken // cancel any in-flight network fetch
    const key = `${location.lat.toFixed(5)},${location.lon.toFixed(5)},${radius}`
    const changed = get().osm.loadedKey !== key
    set((s) => ({
      osm: { status: 'ready', data: json, error: null, note: '', mirror: 'manual import', cached: false, loadedKey: key, origin: { lat: location.lat, lon: location.lon, radius } },
      sceneId: s.sceneId + 1,
      view: 'scene',
      tab: s.tab === 'scene' && changed ? 'vehicles' : s.tab,
      ...(changed ? { vehicles: [], objects: [], selectedId: null, markers: [], evidenceAssessment: {}, time: 0, playing: false } : {}),
    }))
    set({ terrainStatus: 'loading' })
    fetchElevation(location.lat, location.lon, radius).then((sampler) => {
      if (token !== loadToken) return
      set({ terrain: sampler, terrainStatus: sampler.available ? 'ready' : 'unavailable' })
    })
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
  gizmo: 'translate',
  setGizmo: (gizmo) => set({ gizmo }),
  select: (selectedId) => set({ selectedId }),

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
    set({ vehicles: [...vs, v], selectedId: v.id, tab: 'vehicles' })
  },
  updateVehicle: (id, patch) => set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  changeType: (id, type) => {
    const spec = CATALOG[type]
    const current = get().vehicles.find((v) => v.id === id)
    if (!spec || spec.category !== 'vehicle' || !current) return
    get().updateVehicle(id, {
      type, color: spec.color, mass: spec.mass,
      speed: current.speed ?? speedFor(type),
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
    set((s) => ({ vehicles: [...s.vehicles, v], selectedId: v.id }))
  },

  addObject: (type) => {
    const spec = CATALOG[type]
    if (!spec || spec.category === 'vehicle') return
    const objects = get().objects
    const count = objects.filter((item) => item.type === type).length + 1
    const v = makeVehicle(type, objects.length + get().vehicles.length, {
      name: `${spec.label} ${count}`,
      speed: 0, skid: 0, postDist: 0, mass: 0,
      crush: 0, licensePlate: '', vin: '', speedometerKmh: '',
    })
    set({ objects: [...objects, v], selectedId: v.id, tab: 'vehicles' })
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
    set((s) => ({ objects: [...s.objects, v], selectedId: v.id }))
  },
  nudgeHeading: (id, d) => {
    const vehicle = get().vehicles.find((v) => v.id === id)
    if (vehicle) return get().updateVehicle(id, { heading: wrap360(vehicle.heading + d) })
    const object = get().objects.find((v) => v.id === id)
    if (object) return get().updateObject(id, { heading: wrap360(object.heading + d) })
  },

  // ---- evidence markers
  markers: [],
  placing: null, // marker kind currently being placed, or null
  setPlacing: (placing) => set({ placing, tool: placing ? 'marker' : get().tool === 'marker' ? 'select' : get().tool }),
  addMarker: (kind, x, z) => set((s) => ({
    markers: [...s.markers, { id: uid(), kind, x, z, n: s.markers.length + 1, note: '', photo: null, heading: 0, length: kind === 'skid' ? 5 : kind === 'yaw' || kind === 'scrub' ? 3 : 0.5 }],
  })),
  updateMarker: (id, p) => set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...p } : m)) })),
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id).map((m, i) => ({ ...m, n: i + 1 })),
  })),

  // ---- structured accident evidence assessment
  evidenceAssessment: {},
  updateEvidenceField: (fieldId, entry) => set((s) => ({
    evidenceAssessment: {
      ...s.evidenceAssessment,
      [fieldId]: { status: 'unknown', value: '', notes: '', ...(s.evidenceAssessment?.[fieldId] || {}), ...entry },
    },
  })),
  setEvidenceAssessment: (evidenceAssessment) => set({ evidenceAssessment: evidenceAssessment || {} }),

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
  physics: { pair: null, e: 0.25, normalDeg: null, grade: 0, eff: 1, collisionType: 'vehicle_vehicle_head_on', collisionTargetKind: 'vehicle', collisionTargetId: '', primaryVehicleId: '', impactAngleDeg: 0, impactSequence: 'primary' },
  setPhysics: (p) => set((s) => ({ physics: { ...s.physics, ...p } })),

  // ---- playback
  time: 0,
  playing: false,
  rate: 1,
  tMin: -4,
  tMax: 5,
  setTime: (time) => set({ time, playing: false }),
  setPlaying: (playing) => set((s) => ({ playing, time: playing && (s.time >= s.tMax || Math.abs(s.time) < 0.03) ? s.tMin : s.time })),
  setRate: (rate) => set({ rate }),

  // ---- case file
  caseInfo: { number: '', investigator: '', notes: '' },
  setCaseInfo: (p) => set((s) => ({ caseInfo: { ...s.caseInfo, ...p } })),

  // ---- bridge to the WebGL canvas (set by <Bridge/> inside the Canvas)
  snapshotFn: null,
  screenshotFn: null,

  // ---- persistence
  serialize: () => {
    const s = get()
    return {
      version: 1,
      location: s.location, radius: s.radius,
      vehicles: s.vehicles, objects: s.objects, markers: s.markers,
      env: s.env, layers: s.layers, caseInfo: s.caseInfo, physics: s.physics, evidenceAssessment: s.evidenceAssessment,
    }
  },
  restore: (d) => {
    const savedItems = d.vehicles ?? []
    const legacyObjects = savedItems.filter((item) => CATALOG[item.type]?.category !== 'vehicle')
    const savedVehicles = savedItems.filter((item) => CATALOG[item.type]?.category === 'vehicle')
    set({
      location: d.location, radius: d.radius ?? 800,
      vehicles: savedVehicles,
      objects: [...(d.objects ?? []), ...legacyObjects],
      markers: d.markers ?? [], evidenceAssessment: d.evidenceAssessment ?? {},
      env: { ...DEFAULT_ENV, ...d.env }, layers: { ...DEFAULT_LAYERS, ...d.layers },
      caseInfo: d.caseInfo ?? { number: '', investigator: '', notes: '' },
      physics: { pair: null, e: 0.25, normalDeg: null, grade: 0, eff: 1, collisionType: 'vehicle_vehicle_head_on', collisionTargetKind: 'vehicle', collisionTargetId: '', primaryVehicleId: '', impactAngleDeg: 0, impactSequence: 'primary', ...d.physics },
      selectedId: null, time: 0, playing: false, tool: 'select', ruler: [],
    })
    return get().loadOsm({ preserve: true })
  },
}))