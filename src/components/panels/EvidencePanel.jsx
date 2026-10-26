import { useMemo } from 'react'
import { useStore, MARKER_KINDS } from '../../store.js'

const STATUS_OPTIONS = [
  ['unknown', 'Unknown'],
  ['present', 'Present / reported'],
  ['absent', 'Absent / not observed'],
  ['not_assessed', 'Not assessed'],
  ['not_applicable', 'Not applicable'],
]

const SECTIONS = [
  {
    id: 'trace',
    title: 'Physical, trace & biological evidence',
    fields: [
      { id: 'paintChips', label: 'Paint chips / paint transfer', type: 'status' },
      { id: 'blood', label: 'Blood evidence', type: 'status' },
      { id: 'fibres', label: 'Fibre evidence', type: 'status' },
      { id: 'hair', label: 'Hair evidence', type: 'status' },
      { id: 'biologicalOther', label: 'Other biological evidence', type: 'text', placeholder: 'Describe type, location, sample ID' },
      { id: 'glass', label: 'Broken glass / fragments', type: 'status' },
      { id: 'debris', label: 'Vehicle / road debris', type: 'status' },
      { id: 'tyrePrints', label: 'Tyre prints / tyre impressions', type: 'status' },
      { id: 'skidMarks', label: 'Skid marks', type: 'status' },
      { id: 'yawMarks', label: 'Yaw marks', type: 'status' },
      { id: 'scrubMarks', label: 'Scrub marks / tyre skip marks', type: 'status' },
      { id: 'gougeMarks', label: 'Gouge marks / road surface damage', type: 'status' },
      { id: 'fluids', label: 'Fluid leaks / deposits', type: 'status' },
      { id: 'traceNotes', label: 'Trace evidence details / collection IDs', type: 'textarea', placeholder: 'Describe exact location, measurements, collection method, packaging and chain-of-custody reference.' },
    ],
  },
  {
    id: 'vehicle',
    title: 'Vehicle condition & safety systems',
    fields: [
      { id: 'vehicleCondition', label: 'Overall vehicle condition', type: 'select', options: ['Unknown', 'Operable', 'Driveable with damage', 'Not driveable', 'Severely damaged', 'Burned', 'Submerged', 'Other'] },
      { id: 'damageExtent', label: 'Extent of vehicle damage', type: 'select', options: ['Unknown', 'None visible', 'Minor', 'Moderate', 'Severe', 'Critical / total loss', 'Not assessed'] },
      { id: 'damageLocation', label: 'Damage location and description', type: 'textarea', placeholder: 'Front, rear, left, right, roof, underbody; crush/deformation observations and photos.' },
      { id: 'seatBelt', label: 'Seat-belt presence / use / condition', type: 'select', options: ['Unknown', 'Used', 'Not used', 'Partially used / uncertain', 'Damaged', 'Unavailable / not fitted', 'Not assessed'] },
      { id: 'airbags', label: 'Airbag deployment / condition', type: 'select', options: ['Unknown', 'Deployed', 'Not deployed', 'Partially deployed', 'System damaged', 'Not fitted', 'Not assessed'] },
      { id: 'abandonedVehicle', label: 'Vehicle abandoned at scene?', type: 'select', options: ['Unknown', 'Yes', 'No', 'Reported abandoned later', 'Not assessed'] },
      { id: 'tachograph', label: 'Tachograph / event data / chart available?', type: 'select', options: ['Unknown', 'Available', 'Not available', 'Not applicable', 'Requested / pending'] },
      { id: 'tachographDetails', label: 'Tachograph / EDR / telematics details', type: 'textarea', placeholder: 'Device type, time range, download status, custodian and reference number.' },
      { id: 'vehicleNotes', label: 'Vehicle examination notes', type: 'textarea', placeholder: 'Inspection findings, photos, measurements, identifiers and limitations.' },
    ],
  },
  {
    id: 'occupants',
    title: 'Occupants, pedestrians & injuries',
    fields: [
      { id: 'occupantCount', label: 'Number of persons inside vehicle', type: 'number', placeholder: 'e.g. 2' },
      { id: 'occupantDetails', label: 'Occupant details (age, gender, seating position)', type: 'textarea', placeholder: 'One person per line: occupant ID; age if documented; gender if documented; seating position; source of information.' },
      { id: 'occupantKinematics', label: 'Occupant kinematics / movement', type: 'textarea', placeholder: 'Observed or reconstructed movement: forward, lateral, upward, rotation, restraint interaction, ejection/displacement. Identify the evidence and uncertainty.' },
      { id: 'pedestrianCount', label: 'Number of pedestrians involved', type: 'number', placeholder: 'e.g. 1' },
      { id: 'pedestrianInjuries', label: 'Pedestrian injuries', type: 'textarea', placeholder: 'Document reported/observed injuries, body region, source, medical reference if authorised, and uncertainty. Do not infer diagnosis.' },
      { id: 'otherInjuries', label: 'Other occupant / rider injuries', type: 'textarea', placeholder: 'Reported/observed injury information and source.' },
      { id: 'postCrashMovement', label: 'Post-crash movements', type: 'textarea', placeholder: 'Vehicle movement, occupant/pedestrian movement, final rest positions, movement after impact, witnesses or video supporting the account.' },
    ],
  },
  {
    id: 'scene',
    title: 'Scene, road & environment',
    fields: [
      { id: 'roadType', label: 'Type of road', type: 'select', options: ['Unknown', 'Motorway / expressway', 'Highway', 'Urban arterial', 'Residential street', 'Rural road', 'Service road', 'Intersection / junction', 'Roundabout', 'Car park / private road', 'Other'] },
      { id: 'roadLayout', label: 'Road layout / lanes', type: 'textarea', placeholder: 'Lane count, lane widths, divider, shoulder, curve, gradient, junction controls, signs and markings.' },
      { id: 'roadSurface', label: 'Road surface condition', type: 'select', options: ['Unknown', 'Dry', 'Wet', 'Standing water', 'Mud / loose material', 'Gravel', 'Oil / fluid contamination', 'Damaged / uneven', 'Ice / snow', 'Other'] },
      { id: 'weather', label: 'Weather', type: 'select', options: ['Unknown', 'Clear', 'Rain', 'Heavy rain', 'Fog / mist', 'Dust / smoke', 'Windy', 'Other'] },
      { id: 'visibility', label: 'Visibility / lighting', type: 'textarea', placeholder: 'Day/night, street lighting, sight distance, glare, obstruction and measured visibility if known.' },
      { id: 'environmentalFactors', label: 'Environmental factors', type: 'textarea', placeholder: 'Weather, lighting, road friction, drainage, visibility, obstructions, work zones and other relevant factors.' },
      { id: 'cctv', label: 'Roadside CCTV / dashcam available?', type: 'select', options: ['Unknown', 'Yes — obtained', 'Yes — requested / pending', 'Camera identified but no footage', 'No camera located', 'Not assessed'] },
      { id: 'cctvDetails', label: 'CCTV / video details', type: 'textarea', placeholder: 'Camera location, owner, direction of view, time offset, footage period, request status and evidence ID.' },
      { id: 'witnesses', label: 'Witness / photographic evidence', type: 'textarea', placeholder: 'Witness IDs, contact/statement reference, scene photos, measurement source and evidence IDs.' },
    ],
  },
  {
    id: 'circumstances',
    title: 'Driver condition & accident circumstances',
    fields: [
      { id: 'hitAndRun', label: 'Hit-and-run suspected / reported?', type: 'select', options: ['Unknown', 'Yes', 'No', 'Alleged / under investigation', 'Not assessed'] },
      { id: 'driverMedical', label: 'Driver medical condition / illness', type: 'textarea', placeholder: 'Record only documented or reported information, its source and relevance. Do not infer a diagnosis.' },
      { id: 'driverMentalState', label: 'Driver mental / emotional condition', type: 'textarea', placeholder: 'Record attributed observations or documented statements only; avoid unsupported conclusions or diagnoses.' },
      { id: 'phoneUse', label: 'Mobile phone / device use', type: 'select', options: ['Unknown', 'Evidence indicates use', 'Evidence indicates no use', 'Records requested / pending', 'Reported but unverified', 'Not assessed'] },
      { id: 'alcoholDrugs', label: 'Alcohol / drug impairment evidence', type: 'select', options: ['Unknown', 'Positive documented test', 'Negative documented test', 'Reported / suspected, unverified', 'Test requested / pending', 'Not tested / unavailable', 'Not assessed'] },
      { id: 'driverFatigue', label: 'Fatigue / sleep / distraction evidence', type: 'textarea', placeholder: 'Document observations, statements, work/rest records or other sources; distinguish facts from hypotheses.' },
      { id: 'otherCircumstances', label: 'Other circumstances / contributing-factor hypotheses', type: 'textarea', placeholder: 'List each hypothesis separately with supporting evidence, contrary evidence and confidence/limitations.' },
    ],
  },
  {
    id: 'handling',
    title: 'Evidence handling & investigator notes',
    fields: [
      { id: 'collectionDetails', label: 'Collection / chain of custody', type: 'textarea', placeholder: 'Evidence ID, collector, date/time, location, packaging, seal, transfer and storage records.' },
      { id: 'investigatorNotes', label: 'Investigator notes / outstanding actions', type: 'textarea', placeholder: 'Follow-up tasks, evidence requests, unresolved questions and limitations.' },
    ],
  },
]

function defaultEntry(field) {
  return { status: 'unknown', value: '', notes: '' }
}

function EvidenceField({ field, entry, onChange }) {
  const update = (patch) => onChange({ ...entry, ...patch })
  return (
    <div className="ft-block" style={{ padding: 10, border: '1px solid var(--ft-line, rgba(127,127,127,.22))', borderRadius: 8, marginBottom: 8 }}>
      <label className="ft-field">
        <span>{field.label}</span>
        {field.type === 'status' && (
          <select value={entry.status || 'unknown'} onChange={(e) => update({ status: e.target.value })}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        )}
        {field.type === 'text' && <input value={entry.value || ''} placeholder={field.placeholder || ''} onChange={(e) => update({ value: e.target.value })} />}
        {field.type === 'number' && <input type="number" min="0" step="1" value={entry.value || ''} placeholder={field.placeholder || ''} onChange={(e) => update({ value: e.target.value })} />}
        {field.type === 'textarea' && <textarea rows={3} value={entry.value || ''} placeholder={field.placeholder || ''} onChange={(e) => update({ value: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />}
        {field.type === 'select' && (
          <select value={entry.value || ''} onChange={(e) => update({ value: e.target.value })}>
            <option value="">Select / not recorded</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        )}
      </label>
      {field.type !== 'textarea' && (
        <label className="ft-field" style={{ marginTop: 6 }}>
          <span>Notes / source (optional)</span>
          <input value={entry.notes || ''} placeholder="Source, evidence ID, measurement or uncertainty" onChange={(e) => update({ notes: e.target.value })} />
        </label>
      )}
    </div>
  )
}

export default function EvidencePanel() {
  const markers = useStore((s) => s.markers)
  const placing = useStore((s) => s.placing)
  const setPlacing = useStore((s) => s.setPlacing)
  const updateMarker = useStore((s) => s.updateMarker)
  const removeMarker = useStore((s) => s.removeMarker)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const ruler = useStore((s) => s.ruler)
  const clearRuler = useStore((s) => s.clearRuler)
  const evidenceAssessment = useStore((s) => s.evidenceAssessment || {})
  const updateEvidenceField = useStore((s) => s.updateEvidenceField)
  const counts = useMemo(() => {
    const all = Object.values(evidenceAssessment)
    return {
      recorded: all.filter((item) => item && (item.value !== '' && item.value != null || item.notes || item.status && item.status !== 'unknown')).length,
      present: all.filter((item) => item?.status === 'present').length,
    }
  }, [evidenceAssessment])

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Evidence &amp; Scene Examination</h3></div>
      <p className="ft-hint">Record observed, reported, unavailable, and unassessed evidence separately. Unknown does not mean absent. Entries are saved with the case.</p>

      <div className="ft-block">
        <div className="ft-block-title">Evidence summary</div>
        <div className="ft-physlist">
          <div className="ft-physcard"><div className="ft-physcard-name">Recorded fields</div><b>{counts.recorded}</b></div>
          <div className="ft-physcard"><div className="ft-physcard-name">Marked present / reported</div><b>{counts.present}</b></div>
          <div className="ft-physcard"><div className="ft-physcard-name">Scene markers</div><b>{markers.length}</b></div>
        </div>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Scene measurement</div>
        <button className={`ft-secondary ${tool === 'ruler' ? 'ft-addbtn-on' : ''}`} onClick={() => setTool(tool === 'ruler' ? 'select' : 'ruler')} style={{ width: '100%' }}>
          {tool === 'ruler' ? 'Measuring — click two points' : 'Measure distance'}
        </button>
        {ruler.length > 0 && <button className="ft-linkbtn" style={{ marginTop: 8 }} onClick={clearRuler}>Clear points</button>}
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Place a scene marker</div>
        <p className="ft-hint">Choose a marker type, then click the ground in the 3D scene to position it. Marker notes and coordinates can be edited below.</p>
        <div className="ft-addgrid">
          {Object.entries(MARKER_KINDS).map(([k, label]) => (
            <button key={k} className={`ft-addbtn ft-addbtn-marker ${placing === k ? 'ft-addbtn-on' : ''}`} onClick={() => setPlacing(placing === k ? null : k)}>
              <span className="ft-addbtn-label">{label}</span>
            </button>
          ))}
        </div>
        {placing && <div className="ft-placing-note">Click the ground to place a "{MARKER_KINDS[placing]}" marker. <button onClick={() => setPlacing(null)}>Cancel</button></div>}
        <div className="ft-mlist">
          {markers.length === 0 && <p className="ft-empty">No scene markers yet.</p>}
          {markers.map((m) => (
            <div key={m.id} className="ft-mcard">
              <div className="ft-mcard-head">
                <span className="ft-mnum">{m.n}</span>
                <select value={m.kind} onChange={(e) => updateMarker(m.id, { kind: e.target.value })}>
                  {Object.entries(MARKER_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button className="ft-iconbtn ft-iconbtn-danger" aria-label={`Delete marker ${m.n}`} onClick={() => removeMarker(m.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
              <input className="ft-mnote" placeholder="Evidence description / collection ID" value={m.note || ''} onChange={(e) => updateMarker(m.id, { note: e.target.value })} />
              <div className="ft-row2 ft-marker-coords">
                <label className="ft-field"><span>Scene X (m)</span><input type="number" step="0.1" value={Number(m.x || 0)} onChange={(e) => updateMarker(m.id, { x: Number(e.target.value) || 0 })} /></label>
                <label className="ft-field"><span>Scene Z (m)</span><input type="number" step="0.1" value={Number(m.z || 0)} onChange={(e) => updateMarker(m.id, { z: Number(e.target.value) || 0 })} /></label>
              </div>
              <div className="ft-row2">
                <label className="ft-field"><span>Mark direction</span><input type="number" min="0" max="360" step="5" value={Number(m.heading || 0)} onChange={(e) => updateMarker(m.id, { heading: Math.max(0, Math.min(360, Number(e.target.value) || 0)) })} /></label>
                <label className="ft-field"><span>Mark length (m)</span><input type="number" min="0.2" max="18" step="0.5" value={Number(m.length || 0.5)} onChange={(e) => updateMarker(m.id, { length: Math.max(0.2, Math.min(18, Number(e.target.value) || 0.5)) })} /></label>
              </div>
              <div className="ft-mute">Coordinates and mark geometry update directly in the 3D scene.</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Accident evidence register</div>
        {SECTIONS.map((section, index) => (
          <details key={section.id} open={index === 0} style={{ marginBottom: 10, border: '1px solid var(--ft-line, rgba(127,127,127,.22))', borderRadius: 10, padding: 10 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650, padding: '4px 0 10px' }}>{section.title}</summary>
            {section.fields.map((field) => (
              <EvidenceField
                key={field.id}
                field={field}
                entry={evidenceAssessment[field.id] || defaultEntry(field)}
                onChange={(entry) => updateEvidenceField(field.id, entry)}
              />
            ))}
          </details>
        ))}
      </div>
      <p className="ft-note">Forensic integrity: record source, time, collection method, and chain of custody where relevant. Distinguish direct observations from witness reports, hypotheses, and unverified allegations.</p>
    </div>
  )
}