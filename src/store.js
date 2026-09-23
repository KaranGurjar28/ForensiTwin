import { create } from 'zustand'
import { fetchOsm } from './lib/overpass.js'
import { CATALOG, speedFor } from './lib/catalog.js'
import { wrap360 } from './lib/geo.js'

const uid = () => Math.random().toString(36).slice(2, 8)
let loadToken = 0

export const DEFAULT_ENV = {
  hour: 14.5, weather: 'clear', visibility: 600, greenery: 0.6,
}
export const DEFAULT_LAYERS = {
  buildings: true, trees: true, grid: true, labels: true, paths: true, skids: true,
}

export const MARKER_KINDS = {
  debris: 'Debris', gouge: 'Gouge mark', yaw: 'Yaw mark', rest: 'Rest position', witness: 'Witness', other: 'Other',
}

export function makeVehicle(type, index = 0, over = {}) {
  const s = CATALOG[type]
  const heading = [0, 90, 180, 270][index % 4]
  return {
    id: uid(),
    type,
    name: `V${index + 1}`,
    color: s.color,
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
        ...(changed && !preserve ? { vehicles: [], selectedId: null, markers: [], time: 0, playing: false } : {}),
      }))
    } catch (e) {
      if (token !== loadToken) return
      set((s) => ({ osm: { ...s.osm, status: 'error', error: String(e.message || e), note: '' } }))
    }
  },
  cancelLoad: () => { loadToken++; set((s) => ({ osm: { ...s.osm, status: s.osm.data ? 'ready' : 'idle', note: '' } })) },

  // ---- scene settings
  env: DEFAULT_ENV,
  setEnv: (p) => set((s) => ({ env: { ...s.env, ...p } })),
  layers: DEFAULT_LAYERS,
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  cameraMode: 'orbit',
  setCameraMode: (cameraMode) => set({ cameraMode }),

  // ---- vehicles
  vehicles: [],
  selectedId: null,
  gizmo: 'translate',
  setGizmo: (gizmo) => set({ gizmo }),
  select: (selectedId) => set({ selectedId }),
  addVehicle: (type) => {
    const vs = get().vehicles
    const v = makeVehicle(type, vs.length, { name: `V${vs.length + 1}` })
    set({ vehicles: [...vs, v], selectedId: v.id, tab: 'vehicles' })
  },
  updateVehicle: (id, patch) => set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  changeType: (id, type) => {
    const s = CATALOG[type]
    get().updateVehicle(id, { type, color: s.color, mass: s.mass, crush: s.noCrush ? 0 : get().vehicles.find((v) => v.id === id)?.crush ?? 0 })
  },
  removeVehicle: (id) => set((s) => ({ vehicles: s.vehicles.filter((v) => v.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
  duplicateVehicle: (id) => {
    const src = get().vehicles.find((v) => v.id === id)
    if (!src) return
    const n = get().vehicles.length
    const v = { ...src, id: uid(), name: `V${n + 1}`, x: src.x + 4, z: src.z + 3 }
    set((s) => ({ vehicles: [...s.vehicles, v], selectedId: v.id }))
  },
  nudgeHeading: (id, d) => get().updateVehicle(id, { heading: wrap360((get().vehicles.find((v) => v.id === id)?.heading ?? 0) + d) }),

  // ---- evidence markers
  markers: [],
  placing: null, // marker kind currently being placed, or null
  setPlacing: (placing) => set({ placing }),
  addMarker: (kind, x, z) => set((s) => ({
    markers: [...s.markers, { id: uid(), kind, x, z, n: s.markers.length + 1, note: '' }],
  })),
  updateMarker: (id, p) => set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...p } : m)) })),
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id).map((m, i) => ({ ...m, n: i + 1 })),
  })),

  // ---- physics settings
  physics: { pair: null, e: 0.25, normalDeg: null, grade: 0, eff: 1 },
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

  // ---- persistence
  serialize: () => {
    const s = get()
    return {
      version: 1,
      location: s.location, radius: s.radius,
      vehicles: s.vehicles, markers: s.markers,
      env: s.env, layers: s.layers, caseInfo: s.caseInfo, physics: s.physics,
    }
  },
  restore: (d) => {
    set({
      location: d.location, radius: d.radius ?? 800,
      vehicles: d.vehicles ?? [], markers: d.markers ?? [],
      env: { ...DEFAULT_ENV, ...d.env }, layers: { ...DEFAULT_LAYERS, ...d.layers },
      caseInfo: d.caseInfo ?? { number: '', investigator: '', notes: '' },
      physics: { pair: null, e: 0.25, normalDeg: null, grade: 0, eff: 1, ...d.physics },
      selectedId: null, time: 0, playing: false,
    })
    return get().loadOsm({ preserve: true })
  },
}))
