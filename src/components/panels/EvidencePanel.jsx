import { useStore, MARKER_KINDS } from '../../store.js'

export default function EvidencePanel() {
  const markers = useStore((s) => s.markers)
  const placing = useStore((s) => s.placing)
  const setPlacing = useStore((s) => s.setPlacing)
  const updateMarker = useStore((s) => s.updateMarker)
  const removeMarker = useStore((s) => s.removeMarker)

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Evidence markers</h3></div>
      <p className="ft-hint">Pick a type, then click anywhere on the ground in the scene to drop a marker.</p>

      <div className="ft-addgrid">
        {Object.entries(MARKER_KINDS).map(([k, label]) => (
          <button key={k} className={`ft-addbtn ft-addbtn-marker ${placing === k ? 'ft-addbtn-on' : ''}`} onClick={() => setPlacing(placing === k ? null : k)}>
            <span className="ft-addbtn-label">{label}</span>
          </button>
        ))}
      </div>
      {placing && <div className="ft-placing-note">Click the ground to place a "{MARKER_KINDS[placing]}" marker. <button onClick={() => setPlacing(null)}>Cancel</button></div>}

      <div className="ft-mlist">
        {markers.length === 0 && <p className="ft-empty">No markers yet.</p>}
        {markers.map((m) => (
          <div key={m.id} className="ft-mcard">
            <div className="ft-mcard-head">
              <span className="ft-mnum">{m.n}</span>
              <select value={m.kind} onChange={(e) => updateMarker(m.id, { kind: e.target.value })}>
                {Object.entries(MARKER_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button className="ft-iconbtn ft-iconbtn-danger" onClick={() => removeMarker(m.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <input className="ft-mnote" placeholder="Note (optional)" value={m.note} onChange={(e) => updateMarker(m.id, { note: e.target.value })} />
            <div className="ft-mute">{m.x.toFixed(1)} m, {m.z.toFixed(1)} m from pin</div>
          </div>
        ))}
      </div>
    </div>
  )
}
