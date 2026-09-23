// Builds the PDF forensic report: cover, scene views from multiple cameras, and physics tables.
import jsPDF from 'jspdf'
import { useStore } from '../store.js'
import { analyzeCase, ms2kmh } from './physics.js'
import { round } from './geo.js'

const M = 15

function header(doc, title, sub) {
  doc.setFillColor(22, 28, 34)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('ForensiTwin', M, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(title, 210 - M, 14, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  if (sub) { doc.setFontSize(9); doc.setTextColor(90, 90, 90); doc.text(sub, M, 30); doc.setTextColor(0, 0, 0) }
}
function footer(doc, page) {
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(`Page ${page} · Generated ${new Date().toLocaleString()} · First-order screening estimates only`, M, 290)
  doc.setTextColor(0, 0, 0)
}

async function waitFrame() { return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) }

export async function generateReport({ onStatus } = {}) {
  const st = useStore.getState()
  const { caseInfo, vehicles, markers, location, env } = st
  const shoot = st.screenshotFn
  if (!shoot) throw new Error('the 3D view is not ready yet')

  const prevMode = st.cameraMode
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // --- cover
  doc.setFillColor(22, 28, 34)
  doc.rect(0, 0, 210, 297, 'F')
  doc.setTextColor(245, 196, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.text('ForensiTwin', M, 60)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.text('Collision Reconstruction Report', M, 72)
  doc.setDrawColor(245, 196, 0)
  doc.line(M, 80, 210 - M, 80)
  doc.setFontSize(11)
  let y = 100
  const line = (l, v) => { doc.setTextColor(170, 178, 186); doc.text(l, M, y); doc.setTextColor(255, 255, 255); doc.text(String(v || '—'), M + 45, y); y += 9 }
  line('Case number', caseInfo.number)
  line('Investigator', caseInfo.investigator)
  line('Location', location?.label)
  line('Coordinates', location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : '—')
  line('Vehicles involved', vehicles.length)
  line('Evidence markers', markers.length)
  line('Report generated', new Date().toLocaleString())
  if (caseInfo.notes) {
    y += 4
    doc.setTextColor(170, 178, 186)
    doc.text('Notes', M, y); y += 7
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(caseInfo.notes, 210 - M * 2), M, y)
  }

  // --- scene views
  const views = [
    { mode: 'top', title: 'Top-down view' },
    { mode: 'orbit', title: 'Overview' },
    { mode: 'driver', title: "Driver's-eye view" },
  ]
  let page = 1
  for (const view of views) {
    onStatus?.(`Capturing ${view.title.toLowerCase()}…`)
    useStore.setState({ cameraMode: view.mode })
    await waitFrame()
    await new Promise((r) => setTimeout(r, 220))
    let dataUrl
    try { dataUrl = shoot({ quality: 0.9 }) } catch { continue }
    doc.addPage()
    page++
    header(doc, view.title, location?.label)
    doc.addImage(dataUrl, 'JPEG', M, 36, 210 - M * 2, (210 - M * 2) * 0.5625)
    footer(doc, page)
  }
  useStore.setState({ cameraMode: prevMode })

  // --- physics table
  onStatus?.('Compiling calculations…')
  doc.addPage()
  page++
  header(doc, 'Calculated speeds', `${env.hour.toFixed(1)}h · ${env.weather}`)
  y = 40
  doc.setFontSize(10)
  const result = vehicles.length ? analyzeCase(vehicles, st.physics) : { per: [] }
  for (const r of result.per) {
    const v = vehicles.find((x) => x.id === r.id)
    doc.setFont('helvetica', 'bold')
    doc.text(`${v.name} — ${v.type}`, M, y); y += 6
    doc.setFont('helvetica', 'normal')
    const rows = [
      ['Set speed', `${round(v.speed, 0)} km/h`],
      v.skid > 0 && ['Minimum speed from skid distance', `${round(ms2kmh(r.skidSpeed), 1)} km/h`],
      v.crush > 0 && ['Equivalent barrier speed (crush)', `${round(ms2kmh(r.ebs), 1)} km/h`],
      v.postDist > 0 && ['Departure / rest speed', `${round(ms2kmh(r.postSpeed), 1)} km/h`],
    ].filter(Boolean)
    for (const [l, val] of rows) { doc.text(`  ${l}`, M, y); doc.text(val, 130, y); y += 6 }
    y += 3
    if (y > 260) { doc.addPage(); page++; header(doc, 'Calculated speeds (cont.)'); y = 40 }
  }
  if (result.pair && !result.pair.forward.separating) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.text(`Momentum solve: ${result.pair.A.name} × ${result.pair.B.name}`, M, y); y += 6
    doc.setFont('helvetica', 'normal')
    doc.text(`  ${result.pair.A.name} post-impact: ${round(ms2kmh(result.pair.forward.a.speed), 1)} km/h`, M, y); y += 6
    doc.text(`  ${result.pair.B.name} post-impact: ${round(ms2kmh(result.pair.forward.b.speed), 1)} km/h`, M, y); y += 6
    doc.text(`  Energy dissipated: ~${Math.round(result.pair.forward.keLoss / 1000)} kJ`, M, y); y += 6
  }
  if (markers.length) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Evidence markers', M, y); y += 7
    doc.setFont('helvetica', 'normal')
    for (const m of markers) {
      if (y > 275) { doc.addPage(); page++; header(doc, 'Evidence markers (cont.)'); y = 40 }
      doc.text(`  #${m.n}  ${m.kind}  —  ${m.x.toFixed(1)}, ${m.z.toFixed(1)} m from pin${m.note ? '  · ' + m.note : ''}`, M, y)
      y += 6
    }
  }
  footer(doc, page)

  // fix page numbers on every page (they were written before later pages existed on p1 count)
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
  }

  doc.save(`ForensiTwin_${(caseInfo.number || 'report').replace(/\s+/g, '_')}.pdf`)
}
