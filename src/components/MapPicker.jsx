import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useStore } from '../store.js'
import { buildQuery } from '../lib/overpass.js'

const pinIcon = L.divIcon({
  className: '',
  html: '<div class="ft-pin"></div>',
  iconSize: [26, 34],
  iconAnchor: [13, 32],
})

function ClickCapture({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function FlyTo({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 15), { duration: 0.8 })
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

function ImportPanel({ location, radius }) {
  const loadOsmFromJson = useStore((s) => s.loadOsmFromJson)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef()

  const query = buildQuery(location.lat, location.lon, radius)
  const turboUrl = `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}`

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(query)
    } catch {
      setErr('Could not copy automatically — select and copy the query text below instead.')
    }
  }

  const load = (raw) => {
    setErr('')
    try {
      const json = JSON.parse(raw)
      loadOsmFromJson(json)
    } catch {
      setErr("Couldn't parse that as JSON. Make sure you pasted/uploaded the raw Overpass response.")
    }
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => load(String(reader.result))
    reader.readAsText(f)
  }

  if (!open) {
    return (
      <button className="ft-linkbtn" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        Or import OSM data manually
      </button>
    )
  }

  return (
    <div className="ft-import">
      <div className="ft-block-title">Import manually</div>
      <p className="ft-mute" style={{ margin: '4px 0 10px' }}>
        If the live fetch keeps failing, run the same query yourself on Overpass Turbo (it works from
        your own browser even when our automatic fetch doesn't) and load the result here. This always
        works, with no dependency on any mirror being reachable from this app.
      </p>
      <ol style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        <li>
          <a href={turboUrl} target="_blank" rel="noreferrer">Open Overpass Turbo with this query pre-filled</a>
          {' '}(or <button className="ft-linkbtn" style={{ display: 'inline' }} onClick={copyQuery}>copy the query</button> and paste it in yourself)
        </li>
        <li>Click <b>Run</b> there, then <b>Export</b> → <b>raw data</b> → <b>download / copy as raw OSM data</b></li>
        <li>Paste the JSON below, or upload the downloaded file</li>
      </ol>
      <textarea
        className="ft-importbox"
        rows={5}
        placeholder='Paste the Overpass JSON here (starts with { "version": ...)'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="ft-import-actions">
        <button className="ft-cta" onClick={() => load(text)} disabled={!text.trim()}>Load pasted data</button>
        <button className="ft-linkbtn" onClick={() => fileRef.current?.click()}>or choose a file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
      </div>
      {err && <div className="ft-mapdock-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  )
}

export default function MapPicker() {
  const location = useStore((s) => s.location)
  const radius = useStore((s) => s.radius)
  const setRadius = useStore((s) => s.setRadius)
  const setLocation = useStore((s) => s.setLocation)
  const loadOsm = useStore((s) => s.loadOsm)
  const osm = useStore((s) => s.osm)
  const mapView = useStore((s) => s.mapView)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const debRef = useRef()

  const pick = (lat, lon, label) => {
    setLocation({ lat, lon, label: label ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}` })
    setResults([])
  }

  const runSearch = (q) => {
    setQuery(q)
    clearTimeout(debRef.current)
    if (q.trim().length < 3) { setResults([]); setSearchErr(''); return }
    debRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchErr('')
      try {
        const r = await geocode(q)
        setResults(r)
      } catch {
        setSearchErr('Search is unavailable right now.')
      } finally {
        setSearching(false)
      }
    }, 450)
  }

  const useResult = (r) => {
    const lat = parseFloat(r.lat), lon = parseFloat(r.lon)
    pick(lat, lon, r.display_name.split(',').slice(0, 3).join(','))
    setFlyTarget([lat, lon])
    setQuery('')
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        pick(latitude, longitude, 'My location')
        setFlyTarget([latitude, longitude])
      },
      () => setSearchErr('Could not read your location.'),
    )
  }

  return (
    <div className="ft-mappage">
      <div className="ft-mapsearch">
        <div className="ft-searchbox">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search an intersection, address, or landmark…"
          />
          <button className="ft-iconbtn" onClick={useMyLocation} title="Use my location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        {(results.length > 0 || searching || searchErr) && (
          <div className="ft-searchresults">
            {searching && <div className="ft-searchhint">Searching…</div>}
            {searchErr && <div className="ft-searchhint">{searchErr}</div>}
            {results.map((r) => (
              <button key={r.place_id} onClick={() => useResult(r)}>
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <MapContainer center={mapView.center} zoom={mapView.zoom} className="ft-map" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onPick={(lat, lon) => pick(lat, lon)} />
        {flyTarget && <FlyTo center={flyTarget} />}
        {location && (
          <>
            <Marker position={[location.lat, location.lon]} icon={pinIcon} />
            <Circle center={[location.lat, location.lon]} radius={radius} pathOptions={{ color: '#f5c400', weight: 2, fillOpacity: 0.06 }} />
          </>
        )}
      </MapContainer>

      <div className="ft-mapdock">
        {!location && <p className="ft-mapdock-hint">Click the map, search an address, or use your location to drop a pin.</p>}
        {location && (
          <>
            <div className="ft-mapdock-loc">
              <span className="ft-pindot" />
              <div>
                <div className="ft-mapdock-label">{location.label}</div>
                <div className="ft-mapdock-coords">{location.lat.toFixed(5)}, {location.lon.toFixed(5)}</div>
              </div>
            </div>
            <label className="ft-radius">
              Capture radius
              <input type="range" min="250" max="1500" step="50" value={radius} onChange={(e) => setRadius(+e.target.value)} />
              <span>{radius} m</span>
            </label>
            <button className="ft-cta" disabled={osm.status === 'loading'} onClick={() => loadOsm()}>
              {osm.status === 'loading' ? 'Generating twin…' : 'Generate 3D twin'}
            </button>
            {osm.status === 'loading' && <div className="ft-mapdock-note">{osm.note}</div>}
            {osm.status === 'error' && (
              <div className="ft-mapdock-error">
                Couldn't reach OpenStreetMap. {osm.error}
                <button onClick={() => loadOsm()}>Try again</button>
              </div>
            )}
            <ImportPanel location={location} radius={radius} />
          </>
        )}
      </div>
    </div>
  )
}