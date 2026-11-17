import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store.js'

// Evidence footage MUST be supplied by the investigator. No synthetic video is labelled CCTV.
export default function CameraFootagePanel() {
  const videos = useStore(s=>s.cameraFootage || [])
  const add = useStore(s=>s.addCameraFootage)
  const markers=useStore(s=>(s.markers || []).filter(m=>m.kind==='cctv'))
  const remove = useStore(s=>s.removeCameraFootage)
  const videoRef=useRef(null)
  const [source,setSource]=useState('Roadside CCTV')
  const [recordedAt,setRecordedAt]=useState('')
  const [custodian,setCustodian]=useState('')
  const [markerId,setMarkerId]=useState('')
  const [originalName,setOriginalName]=useState('')
  const [objectUrl,setObjectUrl]=useState(null)
  const [error,setError]=useState('')
  useEffect(()=>()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)},[objectUrl])
  const loadFile=e=>{
    const file=e.target.files?.[0]
    if(!file)return
    if(!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      setError('Choose a browser-supported video recording (MP4, WebM, MOV).');return
    }
    setObjectUrl(URL.createObjectURL(file))
    setOriginalName(file.name);setError('')
  }
  const capture=()=>{
    const vid=videoRef.current
    if(!vid || !vid.videoWidth || !vid.videoHeight || !objectUrl) {setError('Load and seek to a valid frame of a real video first.');return}
    const canvas=document.createElement('canvas')
    const width=Math.min(960,vid.videoWidth),height=Math.max(1,Math.round(width*vid.videoHeight/vid.videoWidth))
    canvas.width=width;canvas.height=height
    const ctx=canvas.getContext('2d')
    if(!ctx){setError('Frame capture is not supported in this browser.');return}
    try {
      ctx.drawImage(vid,0,0,width,height)
      const frame=canvas.toDataURL('image/jpeg',0.78)
      add({source:source.trim()||'Unspecified camera',originalName,custodian:custodian.trim(),recordedAt,cameraMarkerId:markerId,
        frame, frameTimeSeconds:Math.round(vid.currentTime*10)/10, frameType:'documented-video-frame',
        note:'Frame sampled from a locally supplied recording; video file itself is not stored in this case JSON.',capturedAt:new Date().toISOString()})
      setError('')
    } catch(err) {setError(`Could not capture frame: ${err.message}. Check video decoding.`)}
  }
  return <div className="ft-block">
    <div className="ft-block-title">Actual CCTV / dashcam footage (documented evidence)</div>
    <p className="ft-hint">Import a recording you are authorised to use. Pause or seek to an important moment and capture a frame for the forensic PDF. These are real source-video frames—not simulated camera views.</p>
    <label className="ft-field"><span>Source / camera ID</span><input value={source} onChange={e=>setSource(e.target.value)} placeholder="Camera ID or road position"/></label>
    <label className="ft-field"><span>Recorded date/time (as supplied)</span><input value={recordedAt} onChange={e=>setRecordedAt(e.target.value)} placeholder="2026-11-18 14:30 IST (if verified)"/></label>
    <label className="ft-field"><span>Linked scene CCTV pole (optional)</span>
      <select value={markerId} onChange={e=>setMarkerId(e.target.value)}>
        <option value="">No scene marker linked</option>
        {markers.map(m=><option key={m.id} value={m.id}>Scene marker {m.n}: {m.note || 'CCTV location'} ({Number(m.x||0).toFixed(1)}, {Number(m.z||0).toFixed(1)} m)</option>)}
      </select>
    </label>
    <label className="ft-field"><span>Footage custodian / evidence ID</span><input value={custodian} onChange={e=>setCustodian(e.target.value)} placeholder="Evidence register ID; authorised source"/></label>
    <label className="ft-field"><span>Choose original video (not uploaded to a server)</span><input type="file" accept="video/*,.mp4,.webm,.mov,.m4v" onChange={loadFile}/></label>
    {objectUrl && <>
      <video ref={videoRef} controls src={objectUrl} preload="metadata" playsInline style={{width:'100%',background:'#0e1317',borderRadius:6,margin:'9px 0'}}/>
      <button className="ft-secondary" onClick={capture} style={{width:'100%'}}>Capture current real-video frame for PDF</button>
    </>}
    {error && <p role="alert" style={{color:'#c84b30',fontSize:12}}>{error}</p>}
    <p className="ft-hint">Stored in the case: source, original filename, frame time, chain-of-custody text and extracted still frame. Preserve the original video separately; the downloaded case JSON does not contain the video bytes or prove authenticity.</p>
    {(videos||[]).map((v,i)=><div className="ft-mcard" key={v.id} style={{marginTop:8}}>
      <b>{i+1}. {v.source||'Camera evidence'} · {v.originalName||'Unknown video'}</b>
      {v.frame && <img src={v.frame} alt={`Video frame from ${v.source||'camera'}`} style={{width:'100%',height:'auto',margin:'7px 0',borderRadius:5}}/>}
      <p className="ft-mute">Video time: {v.frameTimeSeconds ?? '?'} s · Recorded: {v.recordedAt||'Unknown'} · Reference: {v.custodian||'Not recorded'}</p>
      <button className="ft-linkbtn" onClick={()=>remove(v.id)}>Remove frame</button>
    </div>)}
  </div>
}