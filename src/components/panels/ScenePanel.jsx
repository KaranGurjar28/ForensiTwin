import { useStore } from '../../store.js'
import { fmtHour } from '../../lib/geo.js'

const WEATHERS = [
  { id: 'clear', label: 'Clear' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'rain', label: 'Rain' },
  { id: 'fog', label: 'Fog' },
]
const CAMERAS = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'top', label: 'Top-down' },
  { id: 'driver', label: "Driver's eye" },
  { id: 'witness', label: 'Chase' },
]
const LAYER_LABELS = { buildings: 'Buildings', trees: 'Trees & houses', grid: '1 m measure grid', labels: 'Vehicle labels', paths: 'Trajectories', skids: 'Skid marks' }

export default function ScenePanel() {
  const env = useStore((s) => s.env)
  const setEnv = useStore((s) => s.setEnv)
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const radius = useStore((s) => s.radius)
  const worldStats = useStore((s) => s.worldStats)
  const location = useStore((s) => s.location)
  const setView = useStore((s) => s.setView)

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Scene</h3></div>

      <div className="ft-block">
        <div className="ft-block-title">Location</div>
        <div className="ft-locinfo">
          <div>{location?.label}</div>
          <div className="ft-mute">{location && `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · ${radius} m radius`}</div>
          {worldStats && (
            <div className="ft-mute">{worldStats.roads} road segments · {worldStats.buildings} buildings{worldStats.roadNames?.length ? ` · ${worldStats.roadNames.slice(0, 2).join(', ')}` : ''}</div>
          )}
        </div>
        <button className="ft-linkbtn" onClick={() => setView('map')}>Change location</button>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Camera</div>
        <div className="ft-segmented ft-segmented-wrap">
          {CAMERAS.map((c) => (
            <button key={c.id} className={cameraMode === c.id ? 'on' : ''} onClick={() => setCameraMode(c.id)}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Time of day <b>{fmtHour(env.hour)}</b></div>
        <input type="range" min="0" max="23.98" step="0.05" value={env.hour} onChange={(e) => setEnv({ hour: +e.target.value })} />
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Weather</div>
        <div className="ft-segmented">
          {WEATHERS.map((w) => (
            <button key={w.id} className={env.weather === w.id ? 'on' : ''} onClick={() => setEnv({ weather: w.id })}>{w.label}</button>
          ))}
        </div>
        <label className="ft-field" style={{ marginTop: 10 }}>
          <span>Visibility <b>{env.visibility >= 1000 ? `${(env.visibility / 1000).toFixed(1)} km` : `${env.visibility} m`}</b></span>
          <input type="range" min="30" max="2000" step="10" value={env.visibility} onChange={(e) => setEnv({ visibility: +e.target.value })} />
        </label>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Greenery density</div>
        <input type="range" min="0" max="1" step="0.05" value={env.greenery} onChange={(e) => setEnv({ greenery: +e.target.value })} />
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Layers</div>
        <div className="ft-checklist">
          {Object.entries(LAYER_LABELS).map(([k, label]) => (
            <label key={k} className="ft-check">
              <input type="checkbox" checked={layers[k]} onChange={() => toggleLayer(k)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
