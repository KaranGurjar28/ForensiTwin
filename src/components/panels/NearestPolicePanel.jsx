import { useState } from 'react'
import { useStore } from '../../store.js'

const degrees = n => Number(n) * Math.PI / 180
function kilometres(a,b) {
  if (!b || !Number.isFinite(+b.lat) || !Number.isFinite(+b.lng)) return null
  const dlat=degrees(b.lat-a.lat),dlon=degrees(b.lng-a.lon)
  const h=Math.sin(dlat/2)**2+Math.cos(degrees(a.lat))*Math.cos(degrees(b.lat))*Math.sin(dlon/2)**2
  return 12742*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))
}
export default function NearestPolicePanel() {
  const location=useStore(s=>s.location)
  const [busy,setBusy]=useState(false),[results,setResults]=useState([]),[error,setError]=useState('')
  const [numbers,setNumbers]=useState({})
  const findPolice=async()=>{
    if(!location) {setError('Select the accident location first.');return}
    setBusy(true);setError('')
    try {
      const maps=window.google?.maps
      if(!maps?.importLibrary) throw Error('Load the Google Maps location picker first.')
      const {Place,SearchNearbyRankPreference}=await maps.importLibrary('places')
      const request={fields:['displayName','formattedAddress','googleMapsURI','location'],
        locationRestriction:{center:{lat:location.lat,lng:location.lon},radius:15000},
        includedPrimaryTypes:['police'],maxResultCount:6,rankPreference:SearchNearbyRankPreference.DISTANCE}
      const data=await Place.searchNearby(request)
      setResults((data.places||[]).map(p=>({instance:p,
        id:p.id || p.googleMapsURI,name:p.displayName || 'Police station',address:p.formattedAddress||'',
        link:p.googleMapsURI || '',distance:kilometres(location,p.location)})))
      if(!(data.places||[]).length)setError('No stations returned within 15 km. Try Google Maps search manually.')
    } catch(err) {setError((err.message||String(err))+ ' Enable Places API (New) in Google Cloud if needed.')}
    finally{setBusy(false)}
  }
  const checkNumber=async result=>{
    try {
      await result.instance.fetchFields({fields:['nationalPhoneNumber']})
      const phone=result.instance.nationalPhoneNumber || ''
      setNumbers(s=>({...s,[result.id]:phone||'unavailable'}))
    } catch {setNumbers(s=>({...s,[result.id]:'unavailable'}))}
  }
  return <div className="ft-block">
    <div className="ft-block-title">Nearby police stations</div>
    <p className="ft-hint">Find nearby stations for investigator coordination. This tool will NOT notify, call or file a report automatically.</p>
    <button className="ft-secondary" disabled={busy || !location} onClick={findPolice} style={{width:'100%'}}>{busy?'Searching Google Places…':'Find nearby police stations (15 km)'}</button>
    {results.map(p=><div key={p.id} className="ft-mcard" style={{marginTop:9}}>
      <b>{p.name}</b><p className="ft-mute">{p.address}</p>
      {Number.isFinite(p.distance) && <p className="ft-mute">Approx. straight-line distance: {p.distance.toFixed(1)} km (not driving distance)</p>}
      <div className="ft-btnrow" style={{display:'flex',gap:9,flexWrap:'wrap'}}>
        {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
        {!numbers[p.id] && <button className="ft-linkbtn" onClick={()=>checkNumber(p)}>Look up phone</button>}
        {numbers[p.id] && numbers[p.id]!=='unavailable' ? <a href={'tel:'+numbers[p.id]}>Call: {numbers[p.id]}</a> : null}
      </div>
      {numbers[p.id]==='unavailable'&&<span className="ft-mute">Phone unavailable; use Maps to confirm station details.</span>}
    </div>)}
    {error && <div className="ft-mapdock-error">{error}</div>}
    <p className="ft-note">For an active emergency, use the local emergency number yourself. Never assume a station has been contacted until you receive confirmation.</p>
  </div>
}