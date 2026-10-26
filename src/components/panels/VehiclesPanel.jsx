import { useStore } from '../../store.js'
import { CATALOG, VEHICLE_TYPES } from '../../lib/catalog.js'
import { round } from '../../lib/geo.js'

function clampNum(v, min, max) {
  if (Number.isNaN(v)) return min ?? 0
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

function NumField({ label, value, onChange, step = 1, min, max, suffix }) {
  return (
    <label className="ft-field">
      <span>{label}</span>
      <div className="ft-numwrap">
        <input
          type="number"
          value={value === '' || value == null ? '' : Number.isFinite(Number(value)) ? round(Number(value), 2) : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? 0 : clampNum(+e.target.value, min, max))}
        />
        {suffix && <span className="ft-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

function TextField({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="ft-field">
      <span>{label}</span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, display }) {
  return (
    <label className="ft-field">
      <span>{label}<b>{display ?? value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function VehicleCard({ v, selected }) {
  const spec = CATALOG[v.type]
  const isVehicle = spec?.category === 'vehicle'
  const {
    select, updateVehicle, changeType, removeVehicle, duplicateVehicle,
    updateObject, changeObjectType, removeObject, duplicateObject, nudgeHeading,
  } = useStore.getState()
  const update = isVehicle ? updateVehicle : updateObject
  const change = isVehicle ? changeType : changeObjectType
  const remove = isVehicle ? removeVehicle : removeObject
  const duplicate = isVehicle ? duplicateVehicle : duplicateObject

  return (
    <div className={`ft-vcard ${selected ? 'ft-vcard-on' : ''}`} onClick={() => select(v.id)}>
      <div className="ft-vcard-head">
        <span className="ft-swatch" style={{ background: v.color || spec?.color }} />
        <input
          className="ft-vname"
          value={v.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => update(v.id, { name: e.target.value })}
        />
        <button className="ft-iconbtn" onClick={(e) => { e.stopPropagation(); duplicate(v.id) }} title="Duplicate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
        <button className="ft-iconbtn ft-iconbtn-danger" onClick={(e) => { e.stopPropagation(); remove(v.id) }} title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {selected && (
        <div className="ft-vcard-body" onClick={(e) => e.stopPropagation()}>
          <label className="ft-field">
            <span>Vehicle / object type</span>
            <select value={v.type} onChange={(e) => change(v.id, e.target.value)}>
              {VEHICLE_TYPES.filter((t) => (CATALOG[t].category === 'vehicle') === isVehicle).map((t) => (
                <option key={t} value={t}>{CATALOG[t].category === 'vehicle' ? 'Vehicle · ' : CATALOG[t].category === 'person' ? 'Person · ' : CATALOG[t].category === 'animal' ? 'Animal · ' : 'Obstacle · '}{CATALOG[t].label}</option>
              ))}
            </select>
          </label>

          <label className="ft-field ft-color-field">
            <span>Scene colour <b>{v.color || spec?.color}</b></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <input aria-label={`Choose ${v.name} colour`} type="color" value={/^#[0-9a-fA-F]{6}$/.test(v.color || '') ? v.color : (spec?.color || '#777777')} onChange={(e) => update(v.id, { color: e.target.value })} style={{ width: 54, height: 32, padding: 2, border: '1px solid var(--rule)', borderRadius: 5, background: '#fff', cursor: 'pointer' }} />
              <span className="ft-note" style={{ margin: 0 }}>Updates the 3D model and scene label.</span>
            </div>
          </label>

          <div className="ft-row2">
            <NumField label="X (m, east+)" value={v.x} step={0.1} onChange={(x) => update(v.id, { x })} />
            <NumField label="Z (m, south+)" value={v.z} step={0.1} onChange={(z) => update(v.id, { z })} />
          </div>
          <div className="ft-row2">
            <NumField label="Heading" value={v.heading} step={1} min={0} max={360} suffix="°" onChange={(heading) => update(v.id, { heading })} />
            <div className="ft-heading-nudge">
              <button onClick={() => nudgeHeading(v.id, -15)}>−15°</button>
              <button onClick={() => nudgeHeading(v.id, 15)}>+15°</button>
              <button onClick={() => nudgeHeading(v.id, 180)}>180°</button>
            </div>
          </div>

          {isVehicle ? (
            <>
              <div className="ft-divider" />
              <div className="ft-subhead">Vehicle identification</div>
              <TextField label="License plate" value={v.licensePlate} placeholder="Enter observed registration" onChange={(licensePlate) => update(v.id, { licensePlate })} />
              <TextField label="VIN / chassis number" value={v.vin} placeholder="Enter verified VIN; leave blank if unknown" onChange={(vin) => update(v.id, { vin })} />
              <label className="ft-field">
                <span>Visible occupants in vehicle</span>
                <select value={Math.max(0, Math.min(8, Number(v.occupantCount || 0)))} onChange={(e) => update(v.id, { occupantCount: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count === 0 ? 'No occupant models shown' : `${count} occupant${count === 1 ? '' : 's'}`}</option>)}
                </select>
              </label>
              <label className="ft-field">
                <span>Recorded speedometer</span>
                <div className="ft-numwrap">
                  <input
                    type="number"
                    min={0}
                    max={400}
                    step={1}
                    value={v.speedometerKmh ?? ''}
                    onChange={(e) => update(v.id, { speedometerKmh: e.target.value === '' ? '' : clampNum(+e.target.value, 0, 400) })}
                  />
                  <span className="ft-suffix">km/h</span>
                </div>
              </label>

              {!spec.noCrush && (
                <>
                  <div className="ft-divider" />
                  <div className="ft-subhead">Damage assessment</div>
                  <label className="ft-field"><span>Damage direction</span><select value={v.damageSide || 'front'} onChange={(e) => update(v.id, { damageSide: e.target.value })}><option value="front">Front / frontal</option><option value="rear">Rear / rear-end</option><option value="left">Left side</option><option value="right">Right side</option></select></label>
                  <Slider label="Crush extent " value={v.crush} onChange={(crush) => update(v.id, { crush })} display={`${Math.round(v.crush * 100)}%`} />
                  <Slider label="Impact offset " value={v.impactOffset} min={-1} max={1} onChange={(impactOffset) => update(v.id, { impactOffset })} display={v.impactOffset === 0 ? 'centred' : v.impactOffset > 0 ? `${Math.round(v.impactOffset * 100)}% right` : `${Math.round(-v.impactOffset * 100)}% left`} />
                </>
              )}

              <div className="ft-divider" />
              <div className="ft-subhead">Reconstruction inputs</div>
              <div className="ft-row2">
                <NumField label="Simulated pre-impact speed" value={v.speed} step={1} min={0} max={400} suffix="km/h" onChange={(speed) => update(v.id, { speed })} />
                <NumField label="Skid distance" value={v.skid} step={0.5} min={0} suffix="m" onChange={(skid) => update(v.id, { skid })} />
              </div>
              <Slider label="Road friction (μ) " value={v.mu} min={0.15} max={1.0} step={0.01} onChange={(mu) => update(v.id, { mu })} />
              <div className="ft-divider" />
              <div className="ft-subhead">Post-impact rest</div>
              <div className="ft-row2">
                <NumField label="Rest distance" value={v.postDist} step={0.5} min={0} suffix="m" onChange={(postDist) => update(v.id, { postDist })} />
                <NumField label="Rest direction" value={v.postDir} step={1} min={0} max={360} suffix="°" onChange={(postDir) => update(v.id, { postDir })} />
              </div>
              <NumField label="Mass" value={v.mass} step={10} min={1} suffix="kg" onChange={(mass) => update(v.id, { mass })} />
            </>
          ) : (
            <>
              <div className="ft-divider" />
              <div className="ft-subhead">{spec.category === 'person' ? 'Body position & movement' : spec.category === 'animal' ? 'Animal position' : 'Obstacle details'}</div>
              {spec.category === 'person' && <>
                <label className="ft-field"><span>Body posture</span><select value={v.posture || 'upright'} onChange={(e) => update(v.id, { posture: e.target.value })}><option value="upright">Standing upright</option><option value="seated">Seated</option><option value="crouched">Crouched</option><option value="prone-front">Lying face down</option><option value="prone-back">Lying face up</option><option value="side-lying">Lying on side</option></select></label>
                <label className="ft-field"><span>Post-impact posture</span><select value={v.postImpactPosture || 'prone-front'} onChange={(e) => update(v.id, { postImpactPosture: e.target.value })}><option value="prone-front">Face down</option><option value="prone-back">Face up</option><option value="side-lying">On side</option><option value="seated">Seated / slumped</option></select></label>
              </>}
              {spec.category === 'animal' && <>
                <label className="ft-field"><span>Animal posture</span><select value={v.posture || 'standing'} onChange={(e) => update(v.id, { posture: e.target.value })}><option value="standing">Standing</option><option value="lying">Lying on side</option><option value="lying-left">Lying left side</option><option value="lying-right">Lying right side</option></select></label>
                <label className="ft-field"><span>Post-impact posture</span><select value={v.postImpactPosture || 'lying'} onChange={(e) => update(v.id, { postImpactPosture: e.target.value })}><option value="lying">Lying on side</option><option value="lying-left">Lying left side</option><option value="lying-right">Lying right side</option><option value="standing">Standing</option></select></label>
              </>}
              {['person', 'animal'].includes(spec.category) && <div className="ft-row2"><NumField label="Post-impact travel" value={v.postImpactDistance ?? 2.5} step={0.1} min={0} max={30} suffix="m" onChange={(postImpactDistance) => update(v.id, { postImpactDistance })} /><NumField label="Post-impact heading" value={v.postImpactHeading ?? v.heading ?? 0} step={1} min={0} max={360} suffix="°" onChange={(postImpactHeading) => update(v.id, { postImpactHeading })} /></div>}
              {spec.category === 'obstacle' && <p className="ft-field-note">This scene object is saved and rendered separately. It is not treated as a road vehicle in vehicle-to-vehicle momentum calculations.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function VehiclesPanel() {
  const vehicles = useStore((s) => s.vehicles)
  const objects = useStore((s) => s.objects)
  const items = [...vehicles, ...objects]
  const selectedId = useStore((s) => s.selectedId)
  const addVehicle = useStore((s) => s.addVehicle)
  const addObject = useStore((s) => s.addObject)
  const gizmo = useStore((s) => s.gizmo)
  const setGizmo = useStore((s) => s.setGizmo)
  const addType = (type) => CATALOG[type].category === 'vehicle' ? addVehicle(type) : addObject(type)
  const roadTypes = VEHICLE_TYPES.filter((type) => CATALOG[type].category === 'vehicle')
  const personTypes = VEHICLE_TYPES.filter((type) => CATALOG[type].category === 'person' || CATALOG[type].category === 'animal')
  const obstacleTypes = VEHICLE_TYPES.filter((type) => CATALOG[type].category === 'obstacle')

  const AddButtons = ({ types }) => (
    <div className="ft-addgrid">
      {types.map((type) => (
        <button key={type} className="ft-addbtn" onClick={() => addType(type)}>
          <span className="ft-addbtn-label">{CATALOG[type].label}</span>
          <span className="ft-addbtn-sub">{CATALOG[type].sub}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="ft-panel">
      <div className="ft-panel-head">
        <h3>Vehicles &amp; Objects</h3>
        <span className="ft-count">{items.length}</span>
      </div>

      {items.length > 0 && (
        <div className="ft-segmented">
          <button className={gizmo === 'translate' ? 'on' : ''} onClick={() => setGizmo('translate')}>Move</button>
          <button className={gizmo === 'rotate' ? 'on' : ''} onClick={() => setGizmo('rotate')}>Rotate</button>
        </div>
      )}

      <div className="ft-vlist">
        {items.map((v) => (
          <VehicleCard key={v.id} v={v} selected={v.id === selectedId} />
        ))}
      </div>

      <div className="ft-subhead">Add road vehicle</div>
      <AddButtons types={roadTypes} />
      <div className="ft-subhead">Add person or animal</div>
      <AddButtons types={personTypes} />
      <div className="ft-subhead">Add fixed obstacle</div>
      <AddButtons types={obstacleTypes} />
    </div>
  )
}