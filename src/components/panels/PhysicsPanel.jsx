import { useMemo } from 'react'
import { useStore } from '../../store.js'
import { analyzeCase, ms2kmh } from '../../lib/physics.js'
import { round } from '../../lib/geo.js'

const kmh = (ms) => round(ms2kmh(ms), 1)

function Stat({ label, value, unit, warn }) {
  return (
    <div className={`ft-stat ${warn ? 'ft-stat-warn' : ''}`}>
      <span>{label}</span>
      <b>{value}{unit && <i>{unit}</i>}</b>
    </div>
  )
}

export default function PhysicsPanel() {
  const vehicles = useStore((s) => s.vehicles)
  const physics = useStore((s) => s.physics)
  const setPhysics = useStore((s) => s.setPhysics)
  const movers = vehicles.filter((v) => v.mass > 0)

  const result = useMemo(() => (vehicles.length ? analyzeCase(vehicles, physics) : null), [vehicles, physics])

  if (!vehicles.length) {
    return (
      <div className="ft-panel">
        <div className="ft-panel-head"><h3>Physics</h3></div>
        <p className="ft-empty">Add vehicles to the scene to calculate speeds, momentum, and crush-based estimates.</p>
      </div>
    )
  }

  const [idA, idB] = physics.pair ?? [movers[0]?.id, movers.find((v) => v.id !== movers[0]?.id)?.id]

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Physics</h3></div>

      <div className="ft-block">
        <div className="ft-block-title">Per-vehicle estimates</div>
        <div className="ft-physlist">
          {result.per.map((r) => {
            const v = vehicles.find((x) => x.id === r.id)
            return (
              <div key={r.id} className="ft-physcard">
                <div className="ft-physcard-name">{v.name}</div>
                <Stat label="Set speed" value={round(v.speed, 0)} unit="km/h" />
                {v.skid > 0 && <Stat label="Min. speed from skid" value={kmh(r.skidSpeed)} unit="km/h" />}
                {v.crush > 0 && <Stat label="Crush-based (EBS)" value={kmh(r.ebs)} unit="km/h" />}
                {v.postDist > 0 && <Stat label="Departure speed" value={kmh(r.postSpeed)} unit="km/h" />}
              </div>
            )
          })}
        </div>
      </div>

      {movers.length >= 2 && (
        <div className="ft-block">
          <div className="ft-block-title">Two-vehicle momentum</div>
          <div className="ft-row2">
            <label className="ft-field">
              <span>Vehicle A</span>
              <select value={idA} onChange={(e) => setPhysics({ pair: [e.target.value, idB === e.target.value ? idA : idB] })}>
                {movers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="ft-field">
              <span>Vehicle B</span>
              <select value={idB} onChange={(e) => setPhysics({ pair: [idA === e.target.value ? idB : idA, e.target.value] })}>
                {movers.filter((v) => v.id !== idA).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </div>
          <label className="ft-field">
            <span>Restitution (e) <b>{physics.e.toFixed(2)}</b> — {physics.e < 0.1 ? 'near-plastic' : physics.e > 0.6 ? 'bouncy' : 'typical crush'}</span>
            <input type="range" min="0" max="0.9" step="0.01" value={physics.e} onChange={(e) => setPhysics({ e: +e.target.value })} />
          </label>

          {result.pair && !result.pair.forward.separating && (
            <>
              <div className="ft-subhead" style={{ marginTop: 10 }}>Forward solve — from set speeds &amp; headings</div>
              <div className="ft-physlist">
                <div className="ft-physcard">
                  <div className="ft-physcard-name">{result.pair.A.name} after impact</div>
                  <Stat label="Speed" value={kmh(result.pair.forward.a.speed)} unit="km/h" />
                  <Stat label="Δv (severity)" value={kmh(result.pair.forward.a.dv)} unit="km/h" />
                </div>
                <div className="ft-physcard">
                  <div className="ft-physcard-name">{result.pair.B.name} after impact</div>
                  <Stat label="Speed" value={kmh(result.pair.forward.b.speed)} unit="km/h" />
                  <Stat label="Δv (severity)" value={kmh(result.pair.forward.b.dv)} unit="km/h" />
                </div>
              </div>
              <p className="ft-note">Energy dissipated in the impact: ~{Math.round(result.pair.forward.keLoss / 1000)} kJ.</p>
            </>
          )}
          {result.pair?.forward.separating && (
            <p className="ft-note">These two are not on a closing course at the current heading and normal — check headings or positions.</p>
          )}

          <div className="ft-subhead" style={{ marginTop: 10 }}>Reverse solve — from rest positions</div>
          {result.pair?.reverse.error ? (
            <p className="ft-note ft-note-warn">{result.pair.reverse.error}</p>
          ) : result.pair ? (
            <div className="ft-physlist">
              <div className="ft-physcard">
                <div className="ft-physcard-name">{result.pair.A.name} pre-impact (solved)</div>
                <Stat label="Speed" value={kmh(result.pair.reverse.speedA)} unit="km/h" warn={result.pair.reverse.speedA < 0} />
              </div>
              <div className="ft-physcard">
                <div className="ft-physcard-name">{result.pair.B.name} pre-impact (solved)</div>
                <Stat label="Speed" value={kmh(result.pair.reverse.speedB)} unit="km/h" warn={result.pair.reverse.speedB < 0} />
              </div>
            </div>
          ) : null}
          <p className="ft-note">Requires rest distance and direction to be set on both vehicles. Uses conservation of momentum only — a first-order screening estimate, not a substitute for a full reconstruction.</p>
        </div>
      )}
    </div>
  )
}
