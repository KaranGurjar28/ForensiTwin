import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'

const DEFAULT_CENTER = { lat: 23.0225, lng: 72.5714, altitude: 0 }
let googleLoader
function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (!key) return Promise.reject(new Error('Add your Google Maps API key to VITE_GOOGLE_MAPS_API_KEY in .env.local, then restart Vite.'))
  if (!googleLoader) {
    googleLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-forensitwin-google-maps]')
      if (existing) { existing.addEventListener('load', () => resolve(window.google.maps), { once: true }); existing.addEventListener('error', reject, { once: true }); return }
      const script = document.createElement('script')
      script.dataset.forensitwinGoogleMaps = 'true'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&loading=async`
      script.async = true
      script.onload = () => resolve(window.google.maps)
      script.onerror = () => reject(new Error('Google Maps JavaScript API failed to load. Check the key, billing and API restrictions.'))
      document.head.appendChild(script)
    })
  }
  return googleLoader
}

export default function MapPicker() {
  const mapHost = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const geocoderRef = useRef(null)
  const location = useStore((s) => s.location)
  const radius = useStore((s) => s.radius)
  const setRadius = useStore((s) => s.setRadius)
  const setLocation = useStore((s) => s.setLocation)
  const loadOsm = useStore((s) => s.loadOsm)
  const sceneStatus = useStore((s) => s.osm)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [mapMode, setMapMode] = useState('HYBRID')

  const choose = (lat, lon, label) => setLocation({ lat, lon, label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}` })

  useEffect(() => {
    let alive = true
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    loadGoogleMaps(key).then(async (maps) => {
      const { Map3DElement, MapMode, Marker3DElement } = await maps.importLibrary('maps3d')
      if (!alive || !mapHost.current) return
      const center = location ? { lat: location.lat, lng: location.lon, altitude: 0 } : DEFAULT_CENTER
      const map = new Map3DElement({ center, range: 1700, tilt: 58, heading: 15, mode: MapMode?.HYBRID || 'HYBRID', defaultUIHidden: false, gestureHandling: 'COOPERATIVE' })
      map.style.width = '100%'; map.style.height = '100%'
      map.addEventListener('gmp-click', (event) => {
        const p = event.position
        if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) choose(p.lat, p.lng, `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`)
      })
      map.addEventListener('gmp-error', () => setError('Google 3D map could not initialise. Check Maps JavaScript API, billing and API key restrictions.'))
      mapHost.current.replaceChildren(map)
      mapRef.current = map
      markerRef.current = Marker3DElement
      geocoderRef.current = new maps.Geocoder()
      setMapReady(true)
    }).catch((e) => { if (alive) setError(e.message || 'Google Maps could not load.') })
    return () => { alive = false; mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !location || !markerRef.current) return
    const map = mapRef.current
    map.center = { lat: location.lat, lng: location.lon, altitude: 0 }
    const Marker = markerRef.current
    const marker = new Marker({ position: { lat: location.lat, lng: location.lon, altitude: 8 }, label: 'Accident location', extruded: true })
    map.append(marker)
    return () => marker.remove()
  }, [location?.lat, location?.lon])

  const search = async (e) => {
    e.preventDefault(); if (!query.trim() || !geocoderRef.current) return
    setSearching(true); setError('')
    try {
      const response = await geocoderRef.current.geocode({ address: query.trim() })
      const result = response.results?.[0]
      if (!result) throw new Error('No matching location found.')
      const p = result.geometry.location
      choose(p.lat(), p.lng(), result.formatted_address)
      mapRef.current?.flyCameraTo({ endCamera: { center: { lat: p.lat(), lng: p.lng(), altitude: 0 }, range: 1300, tilt: 58, heading: 15 }, durationMillis: 1800 })
      setQuery('')
    } catch (e) { setError(e.message || 'Location search failed. Enable Geocoding through Maps JavaScript API or check your key restrictions.') }
    finally { setSearching(false) }
  }

  const locateMe = () => {
    if (!navigator.geolocation) { setError('Location is not supported by this browser.'); return }
    navigator.geolocation.getCurrentPosition((p) => {
      choose(p.coords.latitude, p.coords.longitude, 'My location')
      mapRef.current?.flyCameraTo({ endCamera: { center: { lat: p.coords.latitude, lng: p.coords.longitude, altitude: 0 }, range: 1200, tilt: 60, heading: 0 }, durationMillis: 1600 })
    }, () => setError('Could not access your location. Check browser location permission.'))
  }

  return <div className="ft-mappage ft-google-mappage">
    <div className="ft-google-map" ref={mapHost} />
    {!mapReady && <div className="ft-google-loading">{error || 'Loading Google Maps 3D…'}</div>}
    <form className="ft-mapsearch" onSubmit={search}>
      <div className="ft-searchbox"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search an address, intersection or landmark…" /><button className="ft-iconbtn" type="submit" disabled={searching}>{searching ? '…' : 'Go'}</button><button className="ft-iconbtn" type="button" onClick={locateMe} title="Use my location">◎</button></div>
    </form>
    <div className="ft-google-mode"><button className={mapMode === 'HYBRID' ? 'active' : ''} onClick={() => { setMapMode('HYBRID'); if (mapRef.current) mapRef.current.mode = 'HYBRID' }}>Satellite</button><button className={mapMode === 'ROADMAP' ? 'active' : ''} onClick={() => { setMapMode('ROADMAP'); if (mapRef.current) mapRef.current.mode = 'ROADMAP' }}>Roadmap</button></div>
    <div className="ft-mapdock">
      {!location ? <p className="ft-mapdock-hint">Click anywhere on the Google 3D map, search for a location, or use your current location.</p> : <>
        <div className="ft-mapdock-loc"><span className="ft-pindot" /><div><div className="ft-mapdock-label">{location.label}</div><div className="ft-mapdock-coords">{location.lat.toFixed(5)}, {location.lon.toFixed(5)}</div></div></div>
        <label className="ft-radius">Reconstruction area <input type="range" min="250" max="1500" step="50" value={radius} onChange={(e) => setRadius(+e.target.value)} /><span>{radius} m</span></label>
        <div className="ft-google-notice"><b>Google Maps-only mode:</b> Google supplies the map and location. It does not provide editable road/building meshes to this app. Generate creates a schematic, editable reconstruction template centred on this coordinate; it is not an automatic copy of the real street layout.</div>
        <button className="ft-cta" disabled={!mapReady || sceneStatus.status === 'loading'} onClick={() => loadOsm()}>{sceneStatus.status === 'loading' ? 'Preparing reconstruction…' : 'Create reconstruction workspace'}</button>
        {sceneStatus.status === 'loading' && <div className="ft-mapdock-note">{sceneStatus.note}</div>}
      </>}
      {error && <div className="ft-mapdock-error">{error}</div>}
    </div>
  </div>
}
