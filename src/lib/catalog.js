// Vehicle catalogue (pure data, no three.js). Dimensions in metres, mass in kg.
// `glb` is optional: if the file exists in /public/models it replaces the procedural model.

export const CATALOG = {
  hatch_s: {
    label: 'Compact hatchback', sub: 'Alto-class', kind: 'car', category: 'vehicle',
    L: 3.5, W: 1.49, H: 1.5, mass: 760, color: '#c9ced4', eye: 1.15,
    glb: '/models/alto.glb', taper: { front: 0.3, rear: 0.1, side: 0.12 }, cabin: 0.6,
  },
  hatch_m: {
    label: 'Hatchback', sub: 'Swift-class', kind: 'car', category: 'vehicle',
    L: 3.85, W: 1.7, H: 1.52, mass: 950, color: '#b3261e', eye: 1.15,
    glb: '/models/swift.glb', taper: { front: 0.3, rear: 0.1, side: 0.12 }, cabin: 0.58,
  },
  sedan: {
    label: 'Sedan', sub: 'C-segment', kind: 'car', category: 'vehicle',
    L: 4.5, W: 1.8, H: 1.45, mass: 1300, color: '#2f4b7c', eye: 1.12,
    glb: '/models/sedan.glb', taper: { front: 0.3, rear: 0.28, side: 0.12 }, cabin: 0.46,
  },
  suv: {
    label: 'SUV', sub: 'compact / mid', kind: 'car', category: 'vehicle',
    L: 4.6, W: 1.9, H: 1.75, mass: 1800, color: '#3d4a3a', eye: 1.4,
    glb: '/models/suv.glb', taper: { front: 0.22, rear: 0.06, side: 0.08 }, cabin: 0.55,
  },
  truck: {
    label: 'Truck', sub: 'rigid, about 9 t', kind: 'truck', category: 'vehicle',
    L: 8.5, W: 2.5, H: 3.4, mass: 9000, color: '#dfe3e7', eye: 2.4,
    glb: '/models/truck.glb', crushL: 4.2,
  },
  rickshaw: {
    label: 'Auto-rickshaw', sub: 'three-wheeler', kind: 'rickshaw', category: 'vehicle',
    L: 2.7, W: 1.35, H: 1.75, mass: 450, color: '#f0c419', eye: 1.3,
    glb: '/models/rickshaw.glb', crushL: 2.2,
  },
  moto: {
    label: 'Motorcycle', sub: 'with rider', kind: 'moto', category: 'vehicle',
    L: 2.0, W: 0.75, H: 1.65, mass: 260, color: '#222831', eye: 1.4,
    glb: '/models/motorcycle.glb', crushL: 1.2,
  },
  van: {
    label: 'Van / MPV', sub: 'passenger or cargo van', kind: 'car', category: 'vehicle',
    L: 5.2, W: 2.0, H: 2.35, mass: 2200, color: '#e6e8e9', eye: 1.65,
    cabin: 0.72, taper: { front: 0.08, rear: 0.03, side: 0.02 }, noCrush: false,
  },
  bus: {
    label: 'Bus', sub: 'city or school bus', kind: 'truck', category: 'vehicle',
    L: 10.5, W: 2.5, H: 3.2, mass: 10500, color: '#e6b93d', eye: 2.35,
    crushL: 5.0, noCrush: false,
  },
  scooter: {
    label: 'Scooter', sub: 'motor scooter', kind: 'moto', category: 'vehicle',
    L: 1.9, W: 0.72, H: 1.35, mass: 125, color: '#2f7d65', eye: 1.2,
    noCrush: true,
  },
  bicycle: {
    label: 'Bicycle', sub: 'pedal cycle', kind: 'bicycle', category: 'vehicle',
    L: 1.8, W: 0.6, H: 1.15, mass: 18, color: '#db5c2b', eye: 1.05,
    noCrush: true,
  },
  pickup: {
    label: 'Pickup truck', sub: 'light commercial vehicle', kind: 'car', category: 'vehicle',
    L: 5.4, W: 2.0, H: 1.9, mass: 2400, color: '#4f6d8a', eye: 1.45,
    cabin: 0.48, taper: { front: 0.14, rear: 0.02, side: 0.04 },
  },
  ambulance: {
    label: 'Ambulance', sub: 'emergency response vehicle', kind: 'truck', category: 'vehicle',
    L: 6.2, W: 2.1, H: 2.8, mass: 3200, color: '#f0f0e8', eye: 1.7, crushL: 3.2,
  },
  fire_truck: {
    label: 'Fire truck', sub: 'heavy emergency vehicle', kind: 'truck', category: 'vehicle',
    L: 8.2, W: 2.5, H: 3.3, mass: 9500, color: '#c92c2c', eye: 2.25, crushL: 4.0,
  },
  tractor: {
    label: 'Tractor', sub: 'agricultural road vehicle', kind: 'truck', category: 'vehicle',
    L: 3.8, W: 1.9, H: 2.4, mass: 3200, color: '#4d8b3b', eye: 1.7, crushL: 2.2,
  },
  person: {
    label: 'Pedestrian', sub: 'adult', kind: 'person', category: 'person',
    L: 0.5, W: 0.6, H: 1.75, mass: 75, color: '#3b6ea5', eye: 1.6, noCrush: true,
  },
  dog: {
    label: 'Dog', sub: 'medium-sized animal', kind: 'animal', category: 'animal',
    L: 0.9, W: 0.35, H: 0.65, mass: 22, color: '#9b704b', noCrush: true,
  },
  cow: {
    label: 'Cow', sub: 'adult cattle', kind: 'animal', category: 'animal',
    L: 2.0, W: 0.8, H: 1.5, mass: 450, color: '#e8dfcf', noCrush: true,
  },
  tree: {
    label: 'Tree', sub: 'standing tree obstacle', kind: 'obstacle', category: 'obstacle',
    L: 2.2, W: 2.2, H: 5.0, mass: 0, color: '#39734b', noCrush: true,
  },
  building: {
    label: 'Building', sub: 'fixed structure', kind: 'obstacle', category: 'obstacle',
    L: 8, W: 8, H: 7, mass: 0, color: '#b8a99a', noCrush: true,
  },
  divider: {
    label: 'Road divider', sub: 'concrete median', kind: 'obstacle', category: 'obstacle',
    L: 4, W: 1.2, H: 0.65, mass: 0, color: '#a7a9ac', noCrush: true,
  },
  barrier: {
    label: 'Safety barrier', sub: 'guardrail / barricade', kind: 'obstacle', category: 'obstacle',
    L: 3, W: 0.25, H: 1.0, mass: 0, color: '#e0b33b', noCrush: true,
  },
  pole: {
    label: 'Pole / streetlight', sub: 'fixed vertical obstacle', kind: 'obstacle', category: 'obstacle',
    L: 0.35, W: 0.35, H: 5.5, mass: 0, color: '#60666b', noCrush: true,
  },
  cone: {
    label: 'Traffic cone', sub: 'temporary road obstacle', kind: 'obstacle', category: 'obstacle',
    L: 0.4, W: 0.4, H: 0.75, mass: 0, color: '#f07824', noCrush: true,
  },
  sign: {
    label: 'Road sign', sub: 'signpost obstacle', kind: 'obstacle', category: 'obstacle',
    L: 0.6, W: 0.25, H: 2.3, mass: 0, color: '#2b6ca3', noCrush: true,
  },
  wall: {
    label: 'Wall / fence', sub: 'fixed linear obstacle', kind: 'obstacle', category: 'obstacle',
    L: 4, W: 0.3, H: 1.6, mass: 0, color: '#aaa49a', noCrush: true,
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

export const DEFAULT_SPEED = {
  person: 0, dog: 0, cow: 0, tree: 0, building: 0, divider: 0, barrier: 0,
  pole: 0, cone: 0, sign: 0, wall: 0, bicycle: 15, scooter: 35,
  van: 45, bus: 40, pickup: 45, ambulance: 60, fire_truck: 45, tractor: 25, moto: 45, rickshaw: 35, truck: 45,
}
export const speedFor = (type) => DEFAULT_SPEED[type] ?? 50

export const PALETTE = ['#c9ced4', '#b3261e', '#2f4b7c', '#3d4a3a', '#f0c419', '#dfe3e7', '#222831', '#6b3fa0', '#0f7b6c', '#e07b1a']