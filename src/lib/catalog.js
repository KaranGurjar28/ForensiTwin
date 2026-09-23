// Vehicle catalogue (pure data, no three.js). Dimensions in metres, mass in kg.
// `glb` is optional: if the file exists in /public/models it replaces the procedural model.

export const CATALOG = {
  hatch_s: {
    label: 'Compact hatchback', sub: 'Alto-class', kind: 'car',
    L: 3.5, W: 1.49, H: 1.5, mass: 760, color: '#c9ced4', eye: 1.15,
    glb: '/models/alto.glb', taper: { front: 0.3, rear: 0.1, side: 0.12 }, cabin: 0.6,
  },
  hatch_m: {
    label: 'Hatchback', sub: 'Swift-class', kind: 'car',
    L: 3.85, W: 1.7, H: 1.52, mass: 950, color: '#b3261e', eye: 1.15,
    glb: '/models/swift.glb', taper: { front: 0.3, rear: 0.1, side: 0.12 }, cabin: 0.58,
  },
  sedan: {
    label: 'Sedan', sub: 'C-segment', kind: 'car',
    L: 4.5, W: 1.8, H: 1.45, mass: 1300, color: '#2f4b7c', eye: 1.12,
    glb: '/models/sedan.glb', taper: { front: 0.3, rear: 0.28, side: 0.12 }, cabin: 0.46,
  },
  suv: {
    label: 'SUV', sub: 'compact / mid', kind: 'car',
    L: 4.6, W: 1.9, H: 1.75, mass: 1800, color: '#3d4a3a', eye: 1.4,
    glb: '/models/suv.glb', taper: { front: 0.22, rear: 0.06, side: 0.08 }, cabin: 0.55,
  },
  truck: {
    label: 'Truck', sub: 'rigid, about 9 t', kind: 'truck',
    L: 8.5, W: 2.5, H: 3.4, mass: 9000, color: '#dfe3e7', eye: 2.4,
    glb: '/models/truck.glb', crushL: 4.2,
  },
  rickshaw: {
    label: 'Auto-rickshaw', sub: 'three-wheeler', kind: 'rickshaw',
    L: 2.7, W: 1.35, H: 1.75, mass: 450, color: '#f0c419', eye: 1.3,
    glb: '/models/rickshaw.glb', crushL: 2.2,
  },
  moto: {
    label: 'Motorcycle', sub: 'with rider', kind: 'moto',
    L: 2.0, W: 0.75, H: 1.65, mass: 260, color: '#222831', eye: 1.4,
    glb: '/models/motorcycle.glb', crushL: 1.2,
  },
  person: {
    label: 'Pedestrian', sub: 'adult', kind: 'person',
    L: 0.5, W: 0.6, H: 1.75, mass: 75, color: '#3b6ea5', eye: 1.6, noCrush: true,
  },
}

export const VEHICLE_TYPES = Object.keys(CATALOG)

/** Crush zone reference dims used by deformPositions() */
export const crushDims = (spec) => ({
  frontZ: spec.L / 2,
  Leff: spec.crushL ?? spec.L,
  W: spec.W,
  H: spec.H,
})

export const DEFAULT_SPEED = { person: 5, moto: 45, rickshaw: 35, truck: 45 }
export const speedFor = (type) => DEFAULT_SPEED[type] ?? 50

export const PALETTE = ['#c9ced4', '#b3261e', '#2f4b7c', '#3d4a3a', '#f0c419', '#dfe3e7', '#222831', '#6b3fa0', '#0f7b6c', '#e07b1a']
