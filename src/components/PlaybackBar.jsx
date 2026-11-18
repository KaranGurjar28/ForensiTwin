import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'

const RATES = [0.25, 0.5, 1, 2]
const RESOLUTIONS = {
  '1080p': { width: 1920, height: 1080, bitrate: 12_000_000 },
  '1440p': { width: 2560, height: 1440, bitrate: 24_000_000 },
  '4K': { width: 3840, height: 2160, bitrate: 45_000_000 },
}
const FPS = 30
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

function drawBrand(ctx, width, height, caseNumber, time) {
  const scale = width / 1280
  const x = 26 * scale
  const y = 24 * scale
  const boxW = 370 * scale
  const boxH = 64 * scale
  ctx.save()
  ctx.fillStyle = 'rgba(13, 19, 26, 0.88)'
  ctx.beginPath()
  ctx.roundRect(x, y, boxW, boxH, 10 * scale)
  ctx.fill()
  ctx.fillStyle = '#f5c400'
  ctx.fillRect(x + 12 * scale, y + 12 * scale, 4 * scale, boxH - 24 * scale)
  ctx.font = `700 ${18 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#f5c400'
  ctx.fillText('FORENSITWIN', x + 28 * scale, y + 27 * scale)
  ctx.font = `500 ${10 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#f4f6f8'
  ctx.fillText('DIGITAL ACCIDENT RECONSTRUCTION', x + 28 * scale, y + 44 * scale)
  const label = caseNumber ? `CASE ${caseNumber}` : 'UNASSIGNED CASE'
  ctx.font = `600 ${11 * scale}px Arial, sans-serif`
  const rightW = ctx.measureText(label).width + 24 * scale
  ctx.fillStyle = 'rgba(13, 19, 26, 0.8)'
  ctx.beginPath()
  ctx.roundRect(width - rightW - 22 * scale, y, rightW, 32 * scale, 7 * scale)
  ctx.fill()
  ctx.fillStyle = '#f4f6f8'
  ctx.fillText(label, width - rightW - 10 * scale, y + 20 * scale)
  ctx.font = `600 ${12 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#ffffff'
  const timeLabel = time < 0 ? `T ${time.toFixed(2)} s` : time > 0 ? `T+ ${time.toFixed(2)} s` : 'IMPACT'
  const timeW = ctx.measureText(timeLabel).width + 26 * scale
  ctx.fillStyle = 'rgba(13, 19, 26, 0.78)'
  ctx.beginPath()
  ctx.roundRect(width - timeW - 22 * scale, height - 52 * scale, timeW, 30 * scale, 7 * scale)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(timeLabel, width - timeW - 9 * scale, height - 32 * scale)
  ctx.restore()
}

export default function PlaybackBar() {
  const vehicles = useStore((s) => s.vehicles)
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const { tMin, tMax } = useStore((s) => ({ tMin: s.tMin, tMax: s.tMax }))
  const raf = useRef(null)
  const last = useRef(0)
  const [resolution, setResolution] = useState('1440p')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    if (!playing || exporting) return
    last.current = performance.now()
    const step = (now) => {
      const dt = Math.max(0, Math.min(0.1, (now - last.current) / 1000)) * useStore.getState().rate
      last.current = now
      const st = useStore.getState()
      const t = Math.min(st.tMax, st.time + dt)
      if (t >= st.tMax) {
        useStore.setState({ time: t, playing: false })
        return
      }
      useStore.setState({ time: t })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, exporting])

  const exportVideo = async () => {
    if (exporting) return
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setExportMessage('Video export requires Chrome or Edge with MediaRecorder and canvas capture support.')
      return
    }
    const createCapture = useStore.getState().videoFrameFn
    if (typeof createCapture !== 'function') {
      setExportMessage('Open Editable 3D and wait for the 3D renderer before exporting.')
      return
    }
    const settings = RESOLUTIONS[resolution]
    setExporting(true)
    setExportMessage(`Preparing ${resolution} WebGL video renderer…`)
    const originalTime = useStore.getState().time
    let capture, recorder, stream, exportRaf = null
    try {
      useStore.setState({ playing: false, time: useStore.getState().tMin })
      await nextFrame()
      capture = createCapture(settings)
      const output = document.createElement('canvas')
      output.width = settings.width
      output.height = settings.height
      const ctx = output.getContext('2d', { alpha: false, desynchronized: false })
      if (!ctx) throw new Error('The browser could not create the output canvas.')
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      stream = output.captureStream(0)
      const videoTrack = stream.getVideoTracks()[0]
      const manualFrames = typeof videoTrack?.requestFrame === 'function'
      if (!manualFrames) {
        stream.getTracks().forEach((track) => track.stop())
        stream = output.captureStream(FPS)
      }
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: settings.bitrate,
      })
      const chunks = []
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
        recorder.onerror = () => reject(new Error('The browser stopped recording. Try a lower resolution.'))
        recorder.onstop = resolve
      })
      const simStart = useStore.getState().tMin
      const simEnd = useStore.getState().tMax
      const duration = Math.max(0.01, simEnd - simStart)
      // Start with an actual 2K/4K WebGL render, not an upscaled screenshot.
      const renderFrame = (t) => {
        const source = capture.draw()
        ctx.drawImage(source, 0, 0, settings.width, settings.height)
        drawBrand(ctx, settings.width, settings.height, useStore.getState().caseInfo?.number || '', t)
        if (manualFrames) stream.getVideoTracks()[0]?.requestFrame()
      }
      renderFrame(simStart)
      recorder.start(1000)
      const started = performance.now()
      let lastRendered = -Infinity
      let lastPercent = -1
      await new Promise((resolve, reject) => {
        const tick = (now) => {
          try {
            if (recorder.state === 'inactive') throw new Error('Recording ended before the replay completed.')
            const elapsed = Math.max(0, (now - started) / 1000)
            const t = Math.min(simEnd, simStart + elapsed)
            useStore.setState({ time: t })
            if (now - lastRendered >= 1000 / FPS || t >= simEnd) {
              lastRendered = now
              renderFrame(t)
            }
            const percent = Math.min(100, Math.round((t - simStart) / duration * 100))
            if (percent !== lastPercent) {
              lastPercent = percent
              setExportMessage(`Recording ${resolution} replay… ${percent}%`)
            }
            if (t >= simEnd) { resolve(); return }
            exportRaf = requestAnimationFrame(tick)
          } catch (error) { reject(error) }
        }
        exportRaf = requestAnimationFrame(tick)
      })
      if (recorder.state === 'recording') recorder.stop()
      await finished
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      if (!blob.size) throw new Error('The exported video was empty. Try 1080p or 1440p.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeCase = (useStore.getState().caseInfo?.number || 'case').replace(/[^\w-]+/g, '_')
      link.href = url
      link.download = `ForensiTwin_${safeCase}_${resolution}_crash-replay.webm`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setExportMessage(`${resolution} WebM downloaded (${settings.width} × ${settings.height}). Verify playback in Chrome, Edge or VLC.`)
    } catch (error) {
      setExportMessage(`Video export failed: ${error?.message || error}. If 4K fails, try 1440p.`)
      if (recorder?.state === 'recording') recorder.stop()
    } finally {
      if (exportRaf) cancelAnimationFrame(exportRaf)
      stream?.getTracks?.().forEach((track) => track.stop())
      capture?.dispose?.()
      useStore.setState({ time: originalTime, playing: false })
      setExporting(false)
    }
  }

  if (!vehicles.length) return null
  const hasMotion = vehicles.some((v) => v.speed > 0 || v.postDist > 0)
  if (!hasMotion) return null
  const span = Math.max(0.001, tMax - tMin)
  const pct = Math.max(0, Math.min(100, ((time - tMin) / span) * 100))

  return (
    <div className="ft-playbar-wrap">
      <div className="ft-playbar">
        <button className="ft-playbtn" disabled={exporting} title={playing ? 'Pause replay' : 'Play replay'} onClick={() => useStore.getState().setPlaying(!playing)}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="ft-playtrack">
          <div className="ft-playfill" style={{ width: `${pct}%` }} />
          <div className="ft-playzero" style={{ left: `${((0 - tMin) / span) * 100}%` }} />
          <input aria-label="Crash replay timeline" disabled={exporting} type="range" min={tMin} max={tMax} step={0.02} value={time} onChange={(e) => useStore.getState().setTime(+e.target.value)} />
        </div>
        <span className="ft-playtime">{time <= -0.02 ? `T${time.toFixed(1)}s` : time >= 0.02 ? `T+${time.toFixed(1)}s` : 'Impact'}</span>
        <div className="ft-segmented ft-ratepicker">
          {RATES.map((r) => <button key={r} disabled={exporting} className={rate === r ? 'on' : ''} onClick={() => useStore.getState().setRate(r)}>{r}×</button>)}
        </div>
        <label className="ft-video-quality" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          Quality
          <select aria-label="Video export resolution" value={resolution} disabled={exporting}
            onChange={(e) => setResolution(e.target.value)}
            style={{ color: '#fff', background: '#263440', border: '1px solid #61707d', borderRadius: 6, padding: '5px 3px', fontSize: 11 }}>
            <option value="1080p">1080p</option>
            <option value="1440p">2K / 1440p</option>
            <option value="4K">4K / 2160p</option>
          </select>
        </label>
        <button className="ft-export-video" disabled={exporting} onClick={exportVideo} title="Render and export the replay at the selected video resolution">
          {exporting ? 'Recording…' : 'Export video'}
        </button>
      </div>
      {exportMessage && <div className="ft-export-message" role="status">{exportMessage}</div>}
    </div>
  )
}