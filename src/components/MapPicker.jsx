import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { pointDistanceMeters, siteCounts } from '../lib/googleScene.js'

const INITIAL = { lat: 23.0225, lng: 72.5714, altitude: 0 }
let googleLoader

// Keep the existing working Google Maps 3D location picker.
// The separate reconstruction engine now loads actual OSM geometry.
function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (!key) return Promise.reject(new Error('Add your Google Maps API key to VITE_GOOGLE_MAPS_API_KEY in .env.local, then restart Vite.'))
  if (!googleLoader) {
    googleLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-forensitwin-google-maps]')
      if (existing) {
        if (window.google?.maps?.importLibrary) resolve(window.google.maps)
        else {
          existing.addEventListener('load', () => resolve(window.google.maps), { once: true })
          existing.addEventListener('error', reject, { once: true })
        }
        return
      }
      ;((g) => {
        var h, a, k, p = 'The Google Maps JavaScript API', c = 'google', l = 'importLibrary', q = '__ib__', m = document, b = window
        b = b[c] || (b[c] = {})
        var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(),
          u = () => h || (h = new Promise(async (f, n) => {
            await (a = m.createElement('script'))
            a.dataset.forensitwinGoogleMaps = 'true'
            e.set('libraries', [...r] + '')
            for (k in g) e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k])
            e.set('callback', c + '.maps.' + q)
            a.src = `https://maps.${c}apis.com/maps/api/js?` + e
            d[q] = f
            a.onerror = () => (h = n(Error(p + ' could not load.')))
            a.nonce = m.querySelector('script[nonce]')?.nonce || ''
            m.head.append(a)
          }))
        d[l] ? console.warn(p + ' only loads once. Ignoring:', g) : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)))
      })({ key, v: 'beta' })
      resolve(window.google.maps)
    })
  }
  return googleLoader
}

function pathOverlay(klass, points, settings) {
  return new klass({ path:points.map(p=>({lat:Number(p.lat),lng:Number(p.lng),altitude:0})), altitudeMode:'RELATIVE_TO_GROUND', ...settings })
}

export default function MapPicker() {
  const host = useRef(null), map = useRef(null), geocoder = useRef(null), markers3d = useRef(null)
  const shapes3d = useRef(null), overlays = useRef([]), pin = useRef(null)
  const toolRef = useRef('select'), draftRef = useRef([])
  const location = useStore(s=>s.location), radius = useStore(s=>s.radius)
  const layout = useStore(s=>s.siteLayout), status = useStore(s=>s.osm)
  const [tool,setTool] = useState('select'), [draft,setDraft] = useState([])
  const [roadWidth,setRoadWidth] = useState(6.6), [buildingHeight,setBuildingHeight] = useState(8)
  const [name,setName] = useState(''), [query,setQuery] = useState('')
  const [mapReady,setMapReady] = useState(false), [mode,setMode] = useState('HYBRID')
  const [error,setError] = useState(''), [searching,setSearching] = useState(false)
  const setLocation = useStore(s=>s.setLocation), setRadius = useStore(s=>s.setRadius)
  const addSiteFeature = useStore(s=>s.addSiteFeature), removeSiteFeature = useStore(s=>s.removeSiteFeature)
  const clearSiteLayout = useStore(s=>s.clearSiteLayout), generate = useStore(s=>s.loadOsm)
  const counts = siteCounts(layout)
  const choose = (lat,lon,label) => {
    setLocation({lat,lon,label:label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`})
    setDraft([])
  }
  useEffect(()=>{ toolRef.current = tool },[tool])
  useEffect(()=>{ draftRef.current = draft },[draft])

  useEffect(()=>{
    let live = true
    loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
      .then(async maps => {
        const [maps3d, geo] = await Promise.all([maps.importLibrary('maps3d'), maps.importLibrary('geocoding')])
        if (!live || !host.current) return
        shapes3d.current = maps3d
        const center = useStore.getState().location
        const m = new maps3d.Map3DElement({
          center:center ? {lat:center.lat,lng:center.lon,altitude:0}:INITIAL,
          range: Math.max(1200,useStore.getState().radius*2.1), tilt:53, heading:0,
          mode:maps3d.MapMode?.HYBRID || 'HYBRID', defaultUIHidden:false, gestureHandling:'COOPERATIVE'
        })
        m.style.width = '100%'; m.style.height = '100%'
        m.addEventListener('gmp-click',ev=>{
          const pos = ev.position
          if (!pos || !Number.isFinite(+pos.lat) || !Number.isFinite(+pos.lng)) return
          const pt = {lat:+pos.lat,lng:+pos.lng}
          const kind = toolRef.current
          if (kind !== 'select') {
            const s = useStore.getState()
            if (!s.location) { setError('Pin an accident location before tracing.'); return }
            if (pointDistanceMeters({lat:s.location.lat,lng:s.location.lon},pt) > s.radius*1.25) {
              setError('Trace points must lie inside the selected reconstruction area. Increase radius or choose a closer location.')
              return
            }
            setError('')
            setDraft(d=>[...d,pt])
            return
          }
          choose(pt.lat,pt.lng)
        })
        m.addEventListener('gmp-error',()=>setError('Google 3D map failed to initialise. Confirm Maps JavaScript API, billing and key restrictions.'))
        host.current.replaceChildren(m)
        map.current = m
        markers3d.current = maps3d.Marker3DElement
        geocoder.current = new geo.Geocoder()
        setMapReady(true)
      })
      .catch(e=>live && setError(e.message || String(e)))
    return ()=>{ live=false; if (map.current) map.current.remove(); map.current=null }
  },[])

  useEffect(()=>{
    const m=map.current, Marker=markers3d.current
    if(!m || !Marker || !location) return
    if(pin.current) pin.current.remove()
    const p=new Marker({ position:{lat:location.lat,lng:location.lon,altitude:7}, label:'Accident location',extruded:true })
    m.append(p); pin.current=p
    return ()=>{p.remove(); if(pin.current===p) pin.current=null}
  },[location?.lat,location?.lon,mapReady])

  useEffect(()=>{
    const m=map.current, types=shapes3d.current
    if (!m || !types) return
    for(const el of overlays.current) el.remove()
    overlays.current=[]
    const attach=(obj)=>{m.append(obj);overlays.current.push(obj)}
    for(const road of layout?.roads || []) {
      if((road.points || []).length>=2) attach(pathOverlay(types.Polyline3DElement,road.points,
        { strokeColor:'#00d9ff',strokeWidth:8,outerColor:'#0b1821',outerWidth:0.3,drawsOccludedSegments:true }))
    }
    for(const b of layout?.buildings || []) {
      if((b.points||[]).length>=3) attach(pathOverlay(types.Polygon3DElement,b.points,
        { strokeColor:'#ffd449',strokeWidth:4,fillColor:'#ffd44955',drawsOccludedSegments:true }))
    }
    if(draft.length>=2) attach(pathOverlay(types.Polyline3DElement,draft,
      {strokeColor:'#ff5e4a',strokeWidth:6,drawsOccludedSegments:true}))
    if(draft.length>=3 && tool==='building') attach(pathOverlay(types.Polygon3DElement,draft,
      {strokeColor:'#ff5e4a',strokeWidth:4,fillColor:'#ff5e4a33'}))
    // This is only an area guide, not road/building geometry.
    if(location) {
      const circle=Array.from({length:48},(_,i)=>{
        const a=i*2*Math.PI/48
        return {lat:location.lat + (radius/111320)*Math.cos(a),
          lng:location.lon + radius/(111320*Math.max(.12,Math.cos(location.lat*Math.PI/180)))*Math.sin(a)}
      })
      attach(pathOverlay(types.Polyline3DElement,[...circle,circle[0]],
        {strokeColor:'#f8c400',strokeWidth:3,drawsOccludedSegments:true}))
    }
    return ()=>{for(const el of overlays.current)el.remove(); overlays.current=[]}
  },[layout,draft,location?.lat,location?.lon,radius,mapReady,tool])

  // Range and radius are both physical metres, not arbitrary 3D zoom values.
  useEffect(()=>{
    if (map.current && location && tool==='select') map.current.range = Math.max(900,radius*2.15)
  },[radius,tool,mapReady])

  const finish=()=>{
    const required=tool==='road'?2:3
    if(draft.length<required) {setError(`Place at least ${required} map points first.`);return}
    const kind=tool==='road'?'roads':'buildings'
    addSiteFeature(kind,{name:name.trim() || (tool==='road'?'Traced road':'Traced building'),points:draft,
      ...(tool==='road'? {width:roadWidth}:{height:buildingHeight})})
    setDraft([]);setTool('select');setName('');setError('')
  }
  const changeTool=(next)=>{setTool(next);setDraft([]);setError('')}
  const search=async(e)=>{
    e.preventDefault(); if(!query.trim() || !geocoder.current) return
    setSearching(true);setError('')
    try {
      const response=await geocoder.current.geocode({address:query.trim()})
      const result=response.results?.[0]; if(!result)throw Error('No matching location found.')
      const pos=result.geometry.location, lat=pos.lat(), lon=pos.lng()
      choose(lat,lon,result.formatted_address)
      map.current?.flyCameraTo?.({endCamera:{center:{lat,lng:lon,altitude:0},range:Math.max(1000,radius*2.15),tilt:53,heading:0},durationMillis:1100})
      setQuery('');setTool('select')
    } catch(err) {setError(err.message||'Geocoding failed. Check API settings.')} finally{setSearching(false)}
  }
  const locateMe=()=>{
    if(!navigator.geolocation){setError('Geolocation unavailable.');return}
    navigator.geolocation.getCurrentPosition(p=>{
      const lat=p.coords.latitude,lon=p.coords.longitude;choose(lat,lon,'My location')
      map.current?.flyCameraTo?.({endCamera:{center:{lat,lng:lon,altitude:0},range:Math.max(1000,radius*2.15),tilt:53,heading:0},durationMillis:1100})
    },()=>setError('Location permission was denied or unavailable.'))
  }

  return <div className="ft-mappage ft-google-mappage">
    <div className="ft-google-map" ref={host}/>
    {!mapReady && <div className="ft-google-loading">{error || 'Loading Google Maps 3D…'}</div>}
    <form className="ft-mapsearch" onSubmit={search}>
      <div className="ft-searchbox">
        <span aria-hidden="true">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search an address, intersection or landmark…"/>
        <button className="ft-iconbtn" disabled={searching} type="submit">{searching?'…':'Go'}</button>
        <button className="ft-iconbtn" type="button" onClick={locateMe} title="Use my location">◎</button>
      </div>
    </form>
    <div className="ft-google-mode">
      <button className={mode==='HYBRID'?'active':''} onClick={()=>{setMode('HYBRID'); if(map.current)map.current.mode='HYBRID'}}>Satellite</button>
      <button className={mode==='ROADMAP'?'active':''} onClick={()=>{setMode('ROADMAP'); if(map.current)map.current.mode='ROADMAP'}}>Roadmap</button>
    </div>
    <div className="ft-mapdock" style={{maxHeight:'min(72vh,660px)',overflowY:'auto',width:'min(420px,calc(100vw - 28px))'}}>
      {!location ? <p className="ft-mapdock-hint">Select your accident location by clicking the Google map or using search.</p> : <>
        <div className="ft-mapdock-loc"><span className="ft-pindot"/><div>
          <div className="ft-mapdock-label">{location.label}</div>
          <div className="ft-mapdock-coords">{location.lat.toFixed(6)}, {location.lon.toFixed(6)}</div>
        </div></div>
        <label className="ft-radius">Reconstruction radius
          <input type="range" min="250" max="1500" step="50" value={radius} onChange={e=>setRadius(+e.target.value)}/>
          <span>{radius} m</span>
        </label>
        <div className="ft-google-notice" style={{lineHeight:1.5}}>
          <b>Automatic real-world 3D workspace:</b> Google shows the location. When you generate a case, ForensiTwin loads roads and building footprints from OpenStreetMap (not Google), creates 3D geometry and caches successful results. Building heights without source measurements are estimates.
        </div>
        <div style={{fontWeight:750,margin:'10px 0 5px'}}>Optional surveyed geometry additions</div>
        <div className="ft-btnrow" style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          <button className="ft-secondary" style={{background:tool==='road'?'#ffd75c':undefined}} onClick={()=>changeTool(tool==='road'?'select':'road')}>Draw road</button>
          <button className="ft-secondary" style={{background:tool==='building'?'#ffd75c':undefined}} onClick={()=>changeTool(tool==='building'?'select':'building')}>Draw building</button>
          {tool!=='select' && <button className="ft-secondary" onClick={()=>changeTool('select')}>Cancel</button>}
        </div>
        {tool!=='select' && <div style={{padding:'7px 0'}}>
          <p className="ft-hint">{tool==='road'?'Add road centreline points from independently surveyed GIS or site measurements.':'Add measured building-corner positions from an independent survey.'} Points: {draft.length}</p>
          <label className="ft-field"><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Observed feature name"/></label>
          {tool==='road' ? <label className="ft-field"><span>Measured/estimated road width (m)</span><input type="number" min="2" max="32" step="0.5" value={roadWidth} onChange={e=>setRoadWidth(Math.min(32,Math.max(2,+e.target.value||2)))}/></label>
            : <label className="ft-field"><span>Building height (m)</span><input type="number" min="2" max="200" step="1" value={buildingHeight} onChange={e=>setBuildingHeight(Math.min(200,Math.max(2,+e.target.value||2)))}/></label>}
          <div className="ft-btnrow"><button className="ft-secondary" onClick={()=>setDraft(d=>d.slice(0,-1))}>Undo point</button><button className="ft-cta" onClick={finish}>Finish {tool}</button></div>
        </div>}
        <p className="ft-hint">Traced: <b>{counts.roads} roads, {counts.buildings} buildings</b></p>
        {[['roads',layout?.roads],['buildings',layout?.buildings]].map(([kind,arr])=>(arr||[]).map(item=><div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,margin:'4px 0'}}>
          <span style={{fontSize:12}}>{item.name || (kind==='roads'?'Road':'Building')} ({item.points?.length||0} pts)</span>
          <button className="ft-linkbtn" onClick={()=>removeSiteFeature(kind,item.id)}>Remove</button>
        </div>))}
        {(counts.roads+counts.buildings>0)&&<button className="ft-linkbtn" onClick={()=>{if(window.confirm('Remove all traced features for this site?'))clearSiteLayout()}}>Clear traced layout</button>}
        <button className="ft-cta" disabled={!mapReady||status.status==='loading'} onClick={()=>generate()} style={{marginTop:12,width:'100%'}}>
          Create reconstruction workspace
        </button>
        {status.status === 'loading' && <p className="ft-hint">{status.note || 'Fetching OpenStreetMap geometry...'}</p>}
        {status.status === 'ready' && <p className="ft-hint" style={{color:'#226f47'}}>{status.note}</p>}
        <p className="ft-hint">Manual features require independent survey data; do not digitize Google's satellite basemap. They are not required for the automatic OSM-based scene.</p>
        {status.status==='error' && <p className="ft-mapdock-error">{status.error}</p>}
      </>}
      {error && <p className="ft-mapdock-error">{error}</p>}
    </div>
  </div>
}