import { useMemo } from 'react'
import { useStore } from '../../store.js'
import { analyzeCase, ms2kmh } from '../../lib/physics.js'
import { round } from '../../lib/geo.js'
import { CATALOG } from '../../lib/catalog.js'

const kmh = (ms) => round(ms2kmh(ms), 1)

function buildVisualScenario() {
  const st = useStore.getState()
  const settings = st.physics
  const vehicles = st.vehicles
  const objects = st.objects || []
  const primary = vehicles.find((v) => v.id === settings.primaryVehicleId) || vehicles[0]
  if (!primary) return
  const type = settings.collisionType || 'vehicle_vehicle_head_on'
  const pairCollision = type.startsWith('vehicle_vehicle') || type === 'vehicle_cyclist' || type === 'vehicle_motorcycle'
  const otherVehicle = vehicles.find((v) => v.id === settings.collisionTargetId && v.id !== primary.id)
    || vehicles.find((v) => v.id === settings.pair?.[1] && v.id !== primary.id)
    || vehicles.find((v) => v.id !== primary.id)
  const targetObject = objects.find((v) => v.id === settings.collisionTargetId)
  const aSpec = CATALOG[primary.type] || { L: 4, W: 1.8 }
  const setV = (v, patch) => st.updateVehicle(v.id, patch)

  if (pairCollision && otherVehicle) {
    const bSpec = CATALOG[otherVehicle.type] || { L: 4, W: 1.8 }
    const gap = (aSpec.L + bSpec.L) / 2
    let a = { x: -gap / 2, z: 0, heading: 90 }
    let b = { x: gap / 2, z: 0, heading: 270 }
    if (type === 'vehicle_cyclist') {
      a = { x: -(aSpec.L / 2 + bSpec.W / 2), z: 0, heading: 90 }
      b = { x: 0, z: 0, heading: 0 }
    } else if (type === 'vehicle_motorcycle') {
      a = { x: -gap / 2, z: 0, heading: 90 }
      b = { x: gap / 2, z: 0.3, heading: 250 }
    } else if (type === 'vehicle_vehicle_rear_end') {
      a = { x: 0, z: -gap / 2, heading: 0 }
      b = { x: 0, z: gap / 2, heading: 0 }
    } else if (type === 'vehicle_vehicle_side') {
      a = { x: -(aSpec.L / 2 + bSpec.W / 2), z: 0, heading: 90 }
      b = { x: 0, z: 0, heading: 0 }
    } else if (type === 'vehicle_vehicle_sideswipe_same') {
      a = { x: -(aSpec.W + bSpec.W) / 4, z: 0, heading: 0 }
      b = { x: (aSpec.W + bSpec.W) / 4, z: 0, heading: 0 }
    } else if (type === 'vehicle_vehicle_sideswipe_opposite') {
      a = { x: -gap / 2, z: -(aSpec.W + bSpec.W) / 2, heading: 90 }
      b = { x: gap / 2, z: (aSpec.W + bSpec.W) / 2, heading: 270 }
    } else if (type === 'vehicle_vehicle_oblique') {
      a = { x: -gap / 2, z: 0, heading: 60 }
      b = { x: gap / 2, z: 0.4, heading: 240 }
    } else if (type === 'vehicle_vehicle_offset') {
      a = { x: -gap / 2, z: -(aSpec.W + bSpec.W) * 0.16, heading: 90 }
      b = { x: gap / 2, z: (aSpec.W + bSpec.W) * 0.16, heading: 270 }
    }
    const damageA = type === 'vehicle_vehicle_sideswipe_same' || type === 'vehicle_vehicle_sideswipe_opposite' ? 'right' : 'front'
    const damageB = type === 'vehicle_vehicle_rear_end' ? 'rear' : type === 'vehicle_vehicle_side' || type.includes('sideswipe') ? 'left' : 'front'
    setV(primary, { ...a, damageSide: damageA, crush: primary.crush > 0 ? primary.crush : 0.18, postDir: a.heading, postDist: primary.postDist > 0 ? primary.postDist : 3.5 })
    setV(otherVehicle, { ...b, damageSide: damageB, crush: otherVehicle.crush > 0 ? otherVehicle.crush : 0.18, postDir: b.heading, postDist: otherVehicle.postDist > 0 ? otherVehicle.postDist : 2.5 })
    st.setPhysics({ pair: [primary.id, otherVehicle.id], primaryVehicleId: primary.id, collisionTargetKind: 'vehicle', collisionTargetId: otherVehicle.id, normalDeg: null })
  } else if (targetObject) {
    const bSpec = CATALOG[targetObject.type] || { W: 0.6, L: 0.6 }
    const isSoftTarget = ['person', 'dog', 'cow'].includes(targetObject.type)
    st.updateObject(targetObject.id, { x: 0, z: 0, heading: 270, ...(isSoftTarget ? { posture: targetObject.type === 'person' ? 'upright' : 'standing', postImpactPosture: targetObject.type === 'person' ? 'prone-front' : 'lying', postImpactHeading: 90, postImpactDistance: targetObject.postImpactDistance || 2.5 } : {}) })
    const x = -(aSpec.L / 2 + (isSoftTarget ? 0.25 : Math.max(bSpec.W || 0.5, 0.5) / 2))
    setV(primary, { x, z: 0, heading: 90, damageSide: 'front', crush: primary.crush > 0 ? primary.crush : 0.18, postDir: 90, postDist: primary.postDist > 0 ? primary.postDist : 3.5 })
    st.setPhysics({ primaryVehicleId: primary.id, collisionTargetKind: 'object', collisionTargetId: targetObject.id, normalDeg: null })
  } else if (type === 'rollover' || type === 'run_off_road' || type === 'multi_event') {
    setV(primary, { x: 0, z: 0, heading: 0, postDir: 35, postDist: primary.postDist > 0 ? primary.postDist : 5 })
    st.setPhysics({ primaryVehicleId: primary.id })
  }
  st.setTime(st.tMin)
  st.setTab('physics')
}

const COLLISION_TYPES = [
  { value: 'vehicle_vehicle_head_on', label: 'Vehicle–vehicle: head-on' },
  { value: 'vehicle_vehicle_offset', label: 'Vehicle–vehicle: offset frontal' },
  { value: 'vehicle_vehicle_rear_end', label: 'Vehicle–vehicle: rear-end' },
  { value: 'vehicle_vehicle_side', label: 'Vehicle–vehicle: side impact / T-bone' },
  { value: 'vehicle_vehicle_sideswipe_same', label: 'Vehicle–vehicle: same-direction sideswipe' },
  { value: 'vehicle_vehicle_sideswipe_opposite', label: 'Vehicle–vehicle: opposite-direction sideswipe' },
  { value: 'vehicle_vehicle_oblique', label: 'Vehicle–vehicle: oblique-angle impact' },
  { value: 'vehicle_vehicle_multiple', label: 'Vehicle–vehicle: multiple impacts' },
  { value: 'vehicle_pedestrian', label: 'Vehicle–pedestrian' },
  { value: 'vehicle_cyclist', label: 'Vehicle–cyclist' },
  { value: 'vehicle_motorcycle', label: 'Vehicle–motorcycle / scooter' },
  { value: 'vehicle_animal', label: 'Vehicle–animal' },
  { value: 'vehicle_tree', label: 'Vehicle–tree' },
  { value: 'vehicle_pole', label: 'Vehicle–pole / streetlight' },
  { value: 'vehicle_wall', label: 'Vehicle–wall / building' },
  { value: 'vehicle_divider', label: 'Vehicle–road divider / kerb' },
  { value: 'vehicle_barrier', label: 'Vehicle–guardrail / barrier' },
  { value: 'vehicle_stationary', label: 'Vehicle–other stationary object' },
  { value: 'rollover', label: 'Rollover / overturning' },
  { value: 'run_off_road', label: 'Run-off-road / no confirmed contact' },
  { value: 'multi_event', label: 'Multi-event collision sequence' },
]

function Stat({ label, value, unit, warn }) {
  return (
    <div className={`ft-stat ${warn ? 'ft-stat-warn' : ''}`}>
      <span>{label}</span>
      <b>{value}{unit && <i>{unit}</i>}</b>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="ft-field">
      <span>{label}</span>
      {children}
      {hint && <small style={{ display: 'block', opacity: 0.72, marginTop: 4 }}>{hint}</small>}
    </label>
  )
}

export default function PhysicsPanel() {
  const vehicles = useStore((s) => s.vehicles)
  const objects = useStore((s) => s.objects ?? [])
  const physics = useStore((s) => s.physics)
  const setPhysics = useStore((s) => s.setPhysics)
  const movers = vehicles.filter((v) => Number(v.mass) > 0)
  const result = useMemo(() => (vehicles.length ? analyzeCase(vehicles, physics) : null), [vehicles, physics])

  const selectedType = physics.collisionType || 'vehicle_vehicle_head_on'
  const targetKind = physics.collisionTargetKind || 'vehicle'
  const targetId = physics.collisionTargetId || ''
  const targetList = targetKind === 'object' ? objects : vehicles
  const target = targetList.find((item) => item.id === targetId)
  const primary = vehicles.find((v) => v.id === (physics.primaryVehicleId || movers[0]?.id)) || movers[0]
  const isPairCollision = selectedType.startsWith('vehicle_vehicle') || selectedType === 'vehicle_cyclist' || selectedType === 'vehicle_motorcycle'
  const energyJ = primary ? 0.5 * Number(primary.mass || 0) * (Number(primary.speed || 0) / 3.6) ** 2 : null
  const targetSpeed = targetKind === 'vehicle' && target ? Number(target.speed || 0) : 0
  const relativeSpeed = primary && target && targetKind === 'vehicle'
    ? Math.hypot(
        (Number(primary.speed || 0) / 3.6) * Math.cos((Number(primary.heading || 0) * Math.PI) / 180) - (targetSpeed / 3.6) * Math.cos((Number(target.heading || 0) * Math.PI) / 180),
        (Number(primary.speed || 0) / 3.6) * Math.sin((Number(primary.heading || 0) * Math.PI) / 180) - (targetSpeed / 3.6) * Math.sin((Number(target.heading || 0) * Math.PI) / 180),
      ) * 3.6
    : null

  const updateTargetKind = (kind) => setPhysics({ collisionTargetKind: kind, collisionTargetId: '' })
  const idA = physics.pair?.[0] ?? movers[0]?.id ?? ''
  const idB = physics.pair?.[1] ?? movers.find((v) => v.id !== idA)?.id ?? ''
  const changeCollisionType = (value) => {
    const objectTypes = { vehicle_pedestrian: ['person'], vehicle_animal: ['dog', 'cow'], vehicle_tree: ['tree'], vehicle_pole: ['pole'], vehicle_wall: ['wall', 'building'], vehicle_divider: ['divider'], vehicle_barrier: ['barrier'], vehicle_stationary: ['tree', 'pole', 'wall', 'building', 'divider', 'barrier', 'cone', 'sign'] }
    if (objectTypes[value]) {
      const nextTarget = objects.find((item) => objectTypes[value].includes(item.type))
      setPhysics({ collisionType: value, collisionTargetKind: 'object', collisionTargetId: nextTarget?.id || '' })
    } else if (value.startsWith('vehicle_vehicle') || value === 'vehicle_cyclist' || value === 'vehicle_motorcycle') {
      const nextTarget = vehicles.find((item) => item.id !== primary?.id && (value === 'vehicle_cyclist' ? item.type === 'bicycle' : value === 'vehicle_motorcycle' ? ['moto', 'scooter'].includes(item.type) : true)) || vehicles.find((item) => item.id !== primary?.id)
      setPhysics({ collisionType: value, collisionTargetKind: 'vehicle', collisionTargetId: nextTarget?.id || '' })
    } else setPhysics({ collisionType: value })
  }

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Physics &amp; Collision Analysis</h3></div>

      <div className="ft-block">
        <div className="ft-block-title">Collision scenario</div>
        <Field label="Collision type">
          <select value={selectedType} onChange={(e) => changeCollisionType(e.target.value)}>
            {COLLISION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <button className="ft-cta" style={{ width: '100%', margin: '4px 0 12px' }} onClick={buildVisualScenario}>Build visual scenario in 3D</button>
        <p className="ft-note">Builds a starting layout and plays the approach into the configured impact. Preset post-impact travel is illustrative; replace it with measured evidence where available.</p>
        <div className="ft-row2">
          <Field label="Primary vehicle">
            <select value={primary?.id || ''} onChange={(e) => setPhysics({ primaryVehicleId: e.target.value })}>
              {movers.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.type}</option>)}
            </select>
          </Field>
          <Field label="Collision partner type">
            <select value={targetKind} onChange={(e) => updateTargetKind(e.target.value)}>
              <option value="vehicle">Vehicle</option>
              <option value="object">Pedestrian, animal or obstacle</option>
            </select>
          </Field>
        </div>
        <Field label={targetKind === 'vehicle' ? 'Other vehicle' : 'Other scene object'}>
          <select value={targetId} onChange={(e) => setPhysics({ collisionTargetId: e.target.value })}>
            <option value="">Select collision partner</option>
            {targetList.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.type}</option>)}
          </select>
        </Field>
        <div className="ft-row2">
          <Field label="Estimated contact angle (degrees)" hint="Record the angle supported by scene evidence.">
            <input type="number" min="0" max="360" step="1" value={physics.impactAngleDeg ?? 0} onChange={(e) => setPhysics({ impactAngleDeg: Math.max(0, Math.min(360, Number(e.target.value) || 0)) })} />
          </Field>
          <Field label="Impact sequence">
            <select value={physics.impactSequence || 'primary'} onChange={(e) => setPhysics({ impactSequence: e.target.value })}>
              <option value="primary">Primary impact</option>
              <option value="secondary">Secondary impact</option>
              <option value="tertiary">Tertiary impact</option>
              <option value="unknown">Sequence unknown</option>
            </select>
          </Field>
        </div>
        {isPairCollision && <p className="ft-note">For vehicle-to-vehicle scenarios, select both vehicles below to run the existing two-body momentum estimate. The collision label records the observed/inferred configuration; it does not by itself validate the model.</p>}
        {!isPairCollision && <p className="ft-note">For pedestrian, animal, rollover, run-off-road, and fixed-obstacle events, the panel records the scenario and provides screening values only. It does not claim to calculate injury probability or a validated vehicle–obstacle impact solution.</p>}
      </div>

      {vehicles.length > 0 && (
        <div className="ft-block">
          <div className="ft-block-title">Per-vehicle screening estimates</div>
          {result?.per?.length ? (
            <div className="ft-physlist">
              {result.per.map((r) => {
                const v = vehicles.find((x) => x.id === r.id)
                if (!v) return null
                return (
                  <div key={r.id} className="ft-physcard">
                    <div className="ft-physcard-name">{v.name}</div>
                    <Stat label="Entered speed" value={round(Number(v.speed) || 0, 1)} unit="km/h" />
                    {v.skid > 0 && <Stat label="Minimum speed from skid model" value={kmh(r.skidSpeed)} unit="km/h" />}
                    {v.crush > 0 && <Stat label="Crush-based EBS estimate" value={kmh(r.ebs)} unit="km/h" />}
                    {v.postDist > 0 && <Stat label="Post-impact departure estimate" value={kmh(r.postSpeed)} unit="km/h" />}
                  </div>
                )
              })}
            </div>
          ) : <p className="ft-empty">Add a road vehicle with a positive mass to view estimates.</p>}
          {primary && (
            <div className="ft-physcard" style={{ marginTop: 8 }}>
              <div className="ft-physcard-name">Selected primary vehicle — {primary.name}</div>
              <Stat label="Kinetic energy at entered speed" value={energyJ == null ? '—' : round(energyJ / 1000, 2)} unit="kJ" />
              {target && targetKind === 'vehicle' && <Stat label="Relative speed magnitude" value={relativeSpeed == null ? '—' : round(relativeSpeed, 1)} unit="km/h" />}
              <p className="ft-note">Kinetic energy uses the entered mass and speed and is not the same as energy absorbed by damage. Relative speed is a vector-based screening value using the stored headings.</p>
            </div>
          )}
        </div>
      )}

      {movers.length >= 2 && isPairCollision && (
        <div className="ft-block">
          <div className="ft-block-title">Two-vehicle momentum model</div>
          <div className="ft-row2">
            <Field label="Vehicle A">
              <select value={idA} onChange={(e) => setPhysics({ pair: [e.target.value, idB === e.target.value ? idA : idB] })}>
                {movers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Vehicle B">
              <select value={idB} onChange={(e) => setPhysics({ pair: [idA === e.target.value ? idB : idA, e.target.value] })}>
                {movers.filter((v) => v.id !== idA).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={`Coefficient of restitution (e): ${Number(physics.e ?? 0.25).toFixed(2)}`}>
            <input type="range" min="0" max="0.9" step="0.01" value={physics.e ?? 0.25} onChange={(e) => setPhysics({ e: +e.target.value })} />
          </Field>
          {result?.pair && !result.pair.forward.separating && (
            <>
              <div className="ft-subhead" style={{ marginTop: 10 }}>Forward solve — from entered speeds and headings</div>
              <div className="ft-physlist">
                <div className="ft-physcard">
                  <div className="ft-physcard-name">{result.pair.A.name} after impact</div>
                  <Stat label="Estimated speed" value={kmh(result.pair.forward.a.speed)} unit="km/h" />
                  <Stat label="Delta-v screening estimate" value={kmh(result.pair.forward.a.dv)} unit="km/h" />
                </div>
                <div className="ft-physcard">
                  <div className="ft-physcard-name">{result.pair.B.name} after impact</div>
                  <Stat label="Estimated speed" value={kmh(result.pair.forward.b.speed)} unit="km/h" />
                  <Stat label="Delta-v screening estimate" value={kmh(result.pair.forward.b.dv)} unit="km/h" />
                </div>
              </div>
              <p className="ft-note">Approximate energy dissipated in the model: {round(result.pair.forward.keLoss / 1000, 2)} kJ.</p>
            </>
          )}
          {result?.pair?.forward?.separating && <p className="ft-note ft-note-warn">The selected vehicles are not on a closing course for the current headings and impact normal. Review positions, headings, and impact geometry.</p>}
          {result?.pair?.reverse?.error ? <p className="ft-note ft-note-warn">{result.pair.reverse.error}</p> : result?.pair && (
            <>
              <div className="ft-subhead" style={{ marginTop: 10 }}>Reverse solve — from post-impact/rest information</div>
              <div className="ft-physlist">
                <div className="ft-physcard"><div className="ft-physcard-name">{result.pair.A.name} pre-impact</div><Stat label="Solved speed" value={kmh(result.pair.reverse.speedA)} unit="km/h" warn={result.pair.reverse.speedA < 0} /></div>
                <div className="ft-physcard"><div className="ft-physcard-name">{result.pair.B.name} pre-impact</div><Stat label="Solved speed" value={kmh(result.pair.reverse.speedB)} unit="km/h" warn={result.pair.reverse.speedB < 0} /></div>
              </div>
            </>
          )}
          <p className="ft-note">Requires valid post-impact/rest distances and directions. This is a simplified two-body model; it omits rotation, tire forces during impact, structural deformation complexity, and uncertainty propagation.</p>
        </div>
      )}

      {!vehicles.length && <p className="ft-empty">Add a road vehicle to configure a collision scenario. Pedestrians, animals and obstacles can be added in the Vehicles &amp; Objects tab and selected as collision partners.</p>}
      {objects.length > 0 && <div className="ft-block"><div className="ft-block-title">Available non-vehicle scene objects</div><p className="ft-note">{objects.length} object(s) available as possible collision partners. These objects are not included in vehicle-to-vehicle momentum calculations.</p></div>}
    </div>
  )
}