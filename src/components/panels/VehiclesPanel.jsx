import { useStore } from '../../store.js'
import { CATALOG, VEHICLE_TYPES } from '../../lib/catalog.js'
import { round } from '../../lib/geo.js'

function NumField({ label, value, onChange, step = 1, min, max, suffix }) {
  return (
    <label className="ft-field">
      <span>{label}</span>
      <div className="ft-numwrap">
        <input
          type="number"
          value={round(value, 2)}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(clampNum(+e.target.value, min, max))}
        />
        {suffix && <span className="ft-suffix">{suffix}</span>}
      </div>
    </label>
  )
}
function clampNum(v, min, max) {
  if (Number.isNaN(v)) return min ?? 0
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, display }) {
  return (
    <label className="ft-field">
      <span>{label}<b>{display ?? value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function VehicleCard({ v, selected }) {
  const spec = CATALOG[v.type]
  const { select, updateVehicle, changeType, removeVehicle, duplicateVehicle, nudgeHeading } = useStore.getState()
  return (
    <div className={`ft-vcard ${selected ? 'ft-vcard-on' : ''}`} onClick={() => select(v.id)}>
      <div className="ft-vcard-head">
        <span className="ft-swatch" style={{ background: v.color }} />
        <input className="ft-vname" value={v.name} onClick={(e) => e.stopPropagation()} onChange={(e) => updateVehicle(v.id, { name: e.target.value })} />
        <button className="ft-iconbtn" onClick={(e) => { e.stopPropagation(); duplicateVehicle(v.id) }} title="Duplicate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
        <button className="ft-iconbtn ft-iconbtn-danger" onClick={(e) => { e.stopPropagation(); removeVehicle(v.id) }} title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {selected && (
        <div className="ft-vcard-body" onClick={(e) => e.stopPropagation()}>
          <label className="ft-field">
            <span>Vehicle type</span>
            <select value={v.type} onChange={(e) => changeType(v.id, e.target.value)}>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>{CATALOG[t].label} — {CATALOG[t].sub}</option>
              ))}
            </select>
          </label>

          <div className="ft-row2">
            <NumField label="X (m, east+)" value={v.x} step={0.1} onChange={(x) => updateVehicle(v.id, { x })} />
            <NumField label="Z (m, south+)" value={v.z} step={0.1} onChange={(z) => updateVehicle(v.id, { z })} />
          </div>
          <div className="ft-row2">
            <NumField label="Heading" value={v.heading} step={1} min={0} max={360} suffix="°" onChange={(heading) => updateVehicle(v.id, { heading })} />
            <div className="ft-heading-nudge">
              <button onClick={() => nudgeHeading(v.id, -15)}>−15°</button>
              <button onClick={() => nudgeHeading(v.id, 15)}>+15°</button>
              <button onClick={() => nudgeHeading(v.id, 180)}>180°</button>
            </div>
          </div>

          {!spec.noCrush && (
            <>
              <Slider label="Frontal crush " value={v.crush} onChange={(crush) => updateVehicle(v.id, { crush })} display={`${Math.round(v.crush * 100)}%`} />
              <Slider label="Impact offset " value={v.impactOffset} min={-1} max={1} onChange={(impactOffset) => updateVehicle(v.id, { impactOffset })} display={v.impactOffset === 0 ? 'centred' : v.impactOffset > 0 ? `${Math.round(v.impactOffset * 100)}% right` : `${Math.round(-v.impactOffset * 100)}% left`} />
            </>
          )}

          <div className="ft-divider" />
          <div className="ft-subhead">Pre-impact</div>
          <div className="ft-row2">
            <NumField label="Speed" value={v.speed} step={1} min={0} max={220} suffix="km/h" onChange={(speed) => updateVehicle(v.id, { speed })} />
            <NumField label="Skid distance" value={v.skid} step={0.5} min={0} suffix="m" onChange={(skid) => updateVehicle(v.id, { skid })} />
          </div>
          <Slider label="Road friction (μ) " value={v.mu} min={0.15} max={1.0} step={0.01} onChange={(mu) => updateVehicle(v.id, { mu })} />

          <div className="ft-divider" />
          <div className="ft-subhead">Post-impact rest</div>
          <div className="ft-row2">
            <NumField label="Rest distance" value={v.postDist} step={0.5} min={0} suffix="m" onChange={(postDist) => updateVehicle(v.id, { postDist })} />
            <NumField label="Rest direction" value={v.postDir} step={1} min={0} max={360} suffix="°" onChange={(postDir) => updateVehicle(v.id, { postDir })} />
          </div>
          <NumField label="Mass" value={v.mass} step={10} min={20} suffix="kg" onChange={(mass) => updateVehicle(v.id, { mass })} />
        </div>
      )}
    </div>
  )
}

export default function VehiclesPanel() {
  const vehicles = useStore((s) => s.vehicles)
  const selectedId = useStore((s) => s.selectedId)
  const addVehicle = useStore((s) => s.addVehicle)
  const gizmo = useStore((s) => s.gizmo)
  const setGizmo = useStore((s) => s.setGizmo)

  return (
    <div className="ft-panel">
      <div className="ft-panel-head">
        <h3>Vehicles</h3>
        <span className="ft-count">{vehicles.length}</span>
      </div>

      {vehicles.length > 0 && (
        <div className="ft-segmented">
          <button className={gizmo === 'translate' ? 'on' : ''} onClick={() => setGizmo('translate')}>Move</button>
          <button className={gizmo === 'rotate' ? 'on' : ''} onClick={() => setGizmo('rotate')}>Rotate</button>
        </div>
      )}

      <div className="ft-vlist">
        {vehicles.map((v) => (
          <VehicleCard key={v.id} v={v} selected={v.id === selectedId} />
        ))}
      </div>

      <div className="ft-addgrid">
        {VEHICLE_TYPES.map((t) => (
          <button key={t} className="ft-addbtn" onClick={() => addVehicle(t)}>
            <span className="ft-addbtn-label">{CATALOG[t].label}</span>
            <span className="ft-addbtn-sub">{CATALOG[t].sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
