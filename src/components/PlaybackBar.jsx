import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'

const RATES = [0.25, 0.5, 1, 2]
const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

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
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    if (!playing || exporting) return
    last.current = performance.now()
    const step = (now) => {
      const dt = ((now - last.current) / 1000) * useStore.getState().rate
      last.current = now
      const st = useStore.getState()
      let t = st.time + dt
      if (t >= st.tMax) {
        t = st.tMax
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
    const source = document.querySelector('.ft-viewport canvas')
    if (!source) {
      setExportMessage('The 3D scene is not ready yet.')
      return
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setExportMessage('Video export requires a browser with MediaRecorder and canvas capture support. Try current Chrome or Edge.')
      return
    }

    setExporting(true)
    setExportMessage('Preparing the crash replay…')
    useStore.setState({ playing: false, time: useStore.getState().tMin })

    let recorder
    let exportRaf = null
    let stream
    try {
      await waitFrame()
      const output = document.createElement('canvas')
      output.width = 1280
      output.height = 720
      const ctx = output.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('Could not create the video export canvas.')
      stream = output.captureStream(30)
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 8_000_000,
      })
      const chunks = []
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
        recorder.onerror = () => reject(new Error('The browser stopped recording the scene.'))
        recorder.onstop = () => resolve()
      })
      recorder.start(250)
      const startClock = performance.now()
      const simStart = useStore.getState().tMin
      const simEnd = useStore.getState().tMax
      const simDuration = Math.max(1, simEnd - simStart)
      let lastDraw = 0
      let lastPercent = -1
      const draw = (now) => {
        if (now - lastDraw >= 1000 / 30) {
          lastDraw = now
          try {
            ctx.drawImage(source, 0, 0, output.width, output.height)
            drawBrand(ctx, output.width, output.height, useStore.getState().caseInfo?.number || '', useStore.getState().time)
          } catch {
            if (recorder?.state === 'recording') recorder.stop()
            return
          }
        }
        const elapsed = (now - startClock) / 1000
        const t = Math.min(simEnd, simStart + elapsed)
        useStore.setState({ time: t })
        const percent = Math.min(100, Math.round((t - simStart) / simDuration * 100))
        if (percent !== lastPercent) { lastPercent = percent; setExportMessage(`Recording crash replay… ${percent}%`) }
        if (t >= simEnd) {
          if (recorder?.state === 'recording') recorder.stop()
          return
        }
        exportRaf = requestAnimationFrame(draw)
      }
      exportRaf = requestAnimationFrame(draw)
      await new Promise((resolve) => {
        const poll = () => {
          if (!exportRaf || recorder?.state !== 'recording') resolve()
          else requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      })
      if (exportRaf) cancelAnimationFrame(exportRaf)
      await finished
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      if (!blob.size) throw new Error('The exported video was empty. Please try again.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeCase = (useStore.getState().caseInfo?.number || 'case').replace(/[^\w-]+/g, '_')
      link.href = url
      link.download = `ForensiTwin_${safeCase}_crash-replay.webm`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setExportMessage('Video downloaded. It can be replayed in a browser or a media player that supports WebM.')
      useStore.setState({ time: useStore.getState().tMin, playing: false })
    } catch (error) {
      setExportMessage(`Video export failed: ${error?.message || error}`)
      if (recorder?.state === 'recording') recorder.stop()
    } finally {
      if (exportRaf) cancelAnimationFrame(exportRaf)
      stream?.getTracks?.().forEach((track) => track.stop())
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
        <button className="ft-export-video" disabled={exporting} onClick={exportVideo} title="Export the full replay as a downloadable video">
          {exporting ? 'Recording…' : 'Export video'}
        </button>
      </div>
      {exportMessage && <div className="ft-export-message" role="status">{exportMessage}</div>}
    </div>
  )
}