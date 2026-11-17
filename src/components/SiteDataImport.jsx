import { useMemo, useState } from 'react'
import { useStore } from '../store.js'
import { parseSiteGeoJSON } from '../lib/siteImport.js'

const backdrop = {
  position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(5,14,24,.64)',
  display: 'grid', placeItems: 'center', padding: 16, pointerEvents: 'auto',
}
const card = {
  width: 'min(580px, 100%)', maxHeight: 'min(84vh, 700px)', overflowY: 'auto',
  padding: 22, borderRadius: 14, background: '#f7fafc', color: '#142231',
  border: '1px solid #d6e1e8', boxShadow: '0 15px 70px rgba(0,0,0,.4)',
}
const button = { background:'#f6c400',color:'#142231',fontWeight:750,fontSize:13,border:0,borderRadius:7,padding:'10px 13px',cursor:'pointer' }
const neutral = {...button, background:'#e7eef3'}

export default function SiteDataImport({ onClose, onComplete, onEmptyScene }) {
  const location = useStore(s => s.location)
  const radius = useStore(s => s.radius)
  const siteLayout = useStore(s => s.siteLayout)
  const [data, setData] = useState(null)
  const [filename, setFilename] = useState('')
  const [interpretUntyped, setInterpretUntyped] = useState(false)
  const [append, setAppend] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => {
    if (!data || !location) return null
    try { return parseSiteGeoJSON(data, location, radius, { interpretUntyped }) }
    catch (e) { return { error: e.message || String(e) } }
  }, [data, location?.lat, location?.lon, radius, interpretUntyped])

  async function chooseFile(event) {
    setError(''); setData(null)
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setError('Choose a GeoJSON file smaller than 25 MB for this reconstruction.'); return }
    try {
      const parsed = JSON.parse(await file.text())
      setData(parsed)
      setFilename(file.name)
    } catch (e) { setError(`File could not be read as GeoJSON: ${e.message}`) }
  }

  async function importData() {
    if (!preview || preview.error || (preview.roads.length + preview.buildings.length) === 0) return
    setBusy(true); setError('')
    try {
      const s = useStore.getState()
      const prefix = `geo-${Date.now().toString(36)}-`
      const roads = preview.roads.map((r, i) => ({...r,id:`${prefix}r${i}`}))
      const buildings = preview.buildings.map((b,i) => ({...b,id:`${prefix}b${i}`}))
      const previous = append ? s.siteLayout : { roads: [], buildings: [] }
      const layout = {
        roads: [...(previous?.roads || []), ...roads],
        buildings: [...(previous?.buildings || []), ...buildings],
        source: 'user-supplied-geojson', sourceFile: filename,
      }
      useStore.setState({ siteLayout: layout })
      await useStore.getState().loadOsm({ preserve: true })
      if (useStore.getState().osm.status === 'error') throw Error(useStore.getState().osm.error || 'Could not build the 3D scene.')
      onComplete?.()
    } catch (e) { setError(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return <div style={backdrop} role="presentation" onMouseDown={e=>{ if(e.target===e.currentTarget)onClose?.() }}>
    <section role="dialog" aria-modal="true" aria-label="Reconstruction geometry source" style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <h2 style={{margin:0,fontSize:20}}>Build the editable 3D scene</h2>
        <button type="button" aria-label="Close" onClick={onClose} style={{...neutral,padding:'7px 10px'}}>✕</button>
      </div>
      <p style={{fontSize:13,lineHeight:1.6,margin:'12px 0'}}>
        Google Maps shows the real location, but does not give ForensiTwin editable road or building meshes.
        This separate simulation uses <b>your own surveyed, authorised or otherwise independently obtained geometry</b>.
        Without geometry, the editable scene will be an empty ground plane.
      </p>
      <div style={{background:'#e6f0f7',borderRadius:9,padding:13,fontSize:12,lineHeight:1.6,marginBottom:13}}>
        <b>Selected accident site</b><div>{location?.label || 'Location not selected'}</div>
        <div>{location?.lat?.toFixed(6)}, {location?.lon?.toFixed(6)} · {radius} m radius</div>
        <div>Current geometry: {siteLayout?.roads?.length || 0} roads, {siteLayout?.buildings?.length || 0} buildings</div>
      </div>
      <label style={{display:'block',fontSize:12,fontWeight:700}}>
        Import a GeoJSON feature file (WGS84 coordinates)
        <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={chooseFile}
          style={{display:'block',marginTop:6,width:'100%',fontSize:12}} />
      </label>
      <div style={{fontSize:12,lineHeight:1.6,marginTop:9,color:'#475a68'}}>
        Recognised geometry: roads as <code>LineString</code> / <code>MultiLineString</code> with a road-type property;
        buildings as <code>Polygon</code> / <code>MultiPolygon</code> with a building-type property.
        Optional properties: <code>width_m</code>, <code>height_m</code> and <code>name</code>.
      </div>
      <label style={{display:'flex',alignItems:'start',gap:8,marginTop:10,fontSize:12,lineHeight:1.5,cursor:'pointer'}}>
        <input type="checkbox" checked={interpretUntyped} onChange={e=>setInterpretUntyped(e.target.checked)} />
        Treat all unclassified lines as roads and all unclassified polygons as buildings (only for files that contain exclusively those surveyed features)
      </label>
      <label style={{display:'flex',alignItems:'start',gap:8,marginTop:7,fontSize:12,cursor:'pointer'}}>
        <input type="checkbox" checked={append} onChange={e=>setAppend(e.target.checked)} />
        Add to existing geometry instead of replacing it
      </label>
      {preview && !preview.error && <div style={{background:'#edf6e8',padding:11,borderRadius:8,marginTop:13,fontSize:12}}>
        <b>{filename}</b>: {preview.roads.length} roads and {preview.buildings.length} buildings in the selected area.
        {preview.skipped > 0 && <span> {preview.skipped} unsupported or unclassified features skipped.</span>}
      </div>}
      {(error || preview?.error) && <div role="alert" style={{padding:10,marginTop:12,borderRadius:7,background:'#fff1ec',color:'#ad2913',fontSize:12}}>{error || preview.error}</div>}
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:18}}>
        <button type="button" style={button} disabled={busy || !preview || !!preview.error || !((preview.roads?.length || 0)+(preview.buildings?.length || 0))} onClick={importData}>
          {busy ? 'Building scene…' : 'Import and open editable 3D'}
        </button>
        <button type="button" style={neutral} onClick={onClose}>Use live Google location</button>
        <button type="button" style={{...neutral,background:'#fff',border:'1px solid #c3d1da'}} onClick={onEmptyScene}>
          Open empty editing space
        </button>
      </div>
      <p style={{fontSize:11,color:'#6a7680',margin:'12px 0 0',lineHeight:1.5}}>
        A simulated 3D building is not independent proof of the structure's dimensions. Record measurement sources and uncertainty.
        Do not extract or digitise Google satellite map content into geometry.
      </p>
    </section>
  </div>
}