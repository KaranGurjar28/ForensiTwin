import NearestPolicePanel from './NearestPolicePanel.jsx'
import { useRef, useState } from 'react'
import { useStore } from '../../store.js'
import { generateReport } from '../../lib/report.js'

export default function CasePanel() {
  const caseInfo = useStore((s) => s.caseInfo)
  const setCaseInfo = useStore((s) => s.setCaseInfo)
  const serialize = useStore((s) => s.serialize)
  const restore = useStore((s) => s.restore)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  const saveFile = () => {
    const data = JSON.stringify(serialize(), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forensitwin-${(caseInfo.number || 'case').replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(()=>URL.revokeObjectURL(url),1200)
  }

  const loadFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        setMsg('Loading case…')
        await restore(data)
        setMsg('Case loaded.')
      } catch {
        setMsg('That file could not be read as a ForensiTwin case.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const exportPdf = async () => {
    setBusy(true)
    setMsg('Capturing scene angles…')
    try {
      await generateReport({ onStatus: setMsg })
      setMsg('Report downloaded.')
    } catch (err) {
      setMsg('Could not generate the report: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ft-panel">
      <div className="ft-panel-head"><h3>Case file</h3></div>

      <div className="ft-block">
        <label className="ft-field"><span>Case number</span><input value={caseInfo.number} onChange={(e) => setCaseInfo({ number: e.target.value })} placeholder="e.g. 2026-TR-0142" /></label>
        <label className="ft-field"><span>Investigator</span><input value={caseInfo.investigator} onChange={(e) => setCaseInfo({ investigator: e.target.value })} placeholder="Name / badge no." /></label>
        <label className="ft-field"><span>Notes</span><textarea rows={4} value={caseInfo.notes} onChange={(e) => setCaseInfo({ notes: e.target.value })} placeholder="Summary of the incident…" /></label>
      </div>

      <div className="ft-block">
        <div className="ft-block-title">Save &amp; reload</div>
        <p className="ft-hint">Case JSON saves the traced road/building geometry, vehicles, evidence fields, and selected camera-video stills. Keep original CCTV recordings separately; their video bytes are not included.</p>
        <div className="ft-btnrow">
          <button className="ft-secondary" onClick={saveFile}>Save case file</button>
          <button className="ft-secondary" onClick={() => fileRef.current?.click()}>Load case file</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={loadFile} />
      </div>

      <NearestPolicePanel />
      <div className="ft-block">
        <div className="ft-block-title">Report</div>
        <p className="ft-hint">Generates the complete PDF with reconstructed top/orbit/driver/side/rear views, structured evidence, all traced site features, and documented frames extracted from supplied CCTV/dashcam videos. Original video files are not embedded.</p>
        <button className="ft-cta" disabled={busy} onClick={exportPdf}>{busy ? 'Working…' : 'Export PDF report'}</button>
        {msg && <div className="ft-mapdock-note">{msg}</div>}
      </div>
    </div>
  )
}