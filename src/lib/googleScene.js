// ForensiTwin's Google-only scene template.
// These are generated schematic roads/buildings, NOT Google-derived geometry or surveyed features.
const METERS_PER_DEG_LAT = 111320
export function createSchematicScene(lat, lon, radius) {
  const elements = []
  let id = 1
  const latOffset = (m) => lat + m / METERS_PER_DEG_LAT
  const lonOffset = (m) => lon + m / (METERS_PER_DEG_LAT * Math.max(0.15, Math.cos(lat * Math.PI / 180)))
  const span = Math.min(radius * 0.78, 900)
  const roadLines = [-0.55, -0.18, 0.18, 0.55].map((f) => f * span)
  const addWay = (coords, tags) => elements.push({ type: 'way', id: id++, geometry: coords.map(([x, z]) => ({ lat: latOffset(z), lon: lonOffset(x) })), tags })
  roadLines.forEach((z, i) => addWay([[-span, z], [0, z], [span, z]], { highway: i === 1 ? 'primary' : 'residential', name: `Schematic Road ${i + 1}`, lanes: i === 1 ? '2' : '2' }))
  roadLines.forEach((x, i) => addWay([[x, -span], [x, 0], [x, span]], { highway: i === 1 ? 'secondary' : 'residential', name: `Schematic Street ${i + 1}`, lanes: '2' }))
  const block = span * 0.16
  const buildingSize = Math.max(12, Math.min(34, span * 0.035))
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    if ((gx === 0 && gz === 0) || ((gx + gz) % 4 === 0)) continue
    const cx = gx * block + (gx >= 0 ? 1 : -1) * span * 0.055
    const cz = gz * block + (gz >= 0 ? 1 : -1) * span * 0.055
    const w = buildingSize * (0.8 + ((gx * gx + gz * gz) % 3) * 0.25)
    const d = buildingSize * (0.7 + ((gx + gz + 8) % 4) * 0.18)
    addWay([[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx+w/2,cz+d/2],[cx-w/2,cz+d/2],[cx-w/2,cz-d/2]], { building: 'yes', height: String(5 + ((gx*gx + gz*gz) % 5) * 3) })
  }
  return { version: 0.6, generator: 'ForensiTwin schematic template — not real map geometry', elements }
}
