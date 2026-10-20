
import jsPDF from 'jspdf'
import { useStore } from '../store.js'
import { analyzeCase, ms2kmh } from './physics.js'
import { round } from './geo.js'

const PAGE_W = 210
const PAGE_H = 297
const M = 15
const CONTENT_W = PAGE_W - M * 2

const COLORS = {
  dark: [22, 28, 34],
  yellow: [245, 196, 0],
  text: [35, 42, 48],
  muted: [105, 114, 122],
  light: [240, 243, 245],
  line: [218, 223, 227],
  white: [255, 255, 255],
}

// WATERMARK IMAGE:
// Paste your watermark image's complete data URL below when available.
// Example: const WATERMARK_IMAGE = 'data:image/png;base64,...'
// Keep an empty string until you have the image.
const WATERMARK_IMAGE = 'models/forensitwin-watermark.png'

const REPORT_TITLE = 'FORENSITWIN - DIGITAL ACCIDENT RECONSTRUCTION'
const GENERATED_AT = new Date()

const safe = (value, fallback = 'Not recorded') => {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number' && !Number.isFinite(value)) return fallback
  return String(value)
}

const firstValue = (...values) =>
  values.find((v) => v !== null && v !== undefined && v !== '')

const numberValue = (value, digits = 2) => {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : 'Not recorded'
}

const kmh = (value, digits = 1) => {
  const n = Number(value)
  return Number.isFinite(n) ? `${round(n, digits)} km/h` : 'Not recorded'
}

const coordinateText = (location) => {
  if (
    Number.isFinite(Number(location?.lat)) &&
    Number.isFinite(Number(location?.lon))
  ) {
    return `${Number(location.lat).toFixed(6)}, ${Number(location.lon).toFixed(6)}`
  }
  return 'Not recorded'
}

const getVehicleName = (vehicle, index) =>
  safe(vehicle?.name, `V${index + 1}`)

const getVehicleId = (vehicle, index) =>
  safe(vehicle?.id, `V${index + 1}`)

const getPosition = (object) => {
  const p = object?.position || object?.initialPosition || object?.initial
  if (p && typeof p === 'object') {
    return `X ${numberValue(p.x)}, Y ${numberValue(p.y)}, Z ${numberValue(p.z)} m`
  }

  if (Number.isFinite(object?.x) && Number.isFinite(object?.z)) {
    return `X ${numberValue(object.x)}, Z ${numberValue(object.z)} m`
  }

  return 'Not recorded'
}

const getFinalPosition = (vehicle) =>
  getPosition(vehicle?.finalPosition || vehicle?.final || vehicle?.postPosition)

const getDirection = (vehicle) => {
  const direction = firstValue(
    vehicle?.directionLabel,
    vehicle?.headingLabel,
    vehicle?.direction,
    vehicle?.heading
  )

  if (typeof direction === 'object') {
    return `X ${numberValue(direction.x)}, Z ${numberValue(direction.z)}`
  }

  return safe(direction)
}

const getEnvironmentValue = (env, ...keys) =>
  safe(firstValue(...keys.map((key) => env?.[key])))

function setTextColor(doc, color) {
  doc.setTextColor(...color)
}

function setDrawColor(doc, color) {
  doc.setDrawColor(...color)
}

function setFillColor(doc, color) {
  doc.setFillColor(...color)
}

function drawHeader(doc, sectionTitle, subtitle = '') {
  setFillColor(doc, COLORS.dark)
  doc.rect(0, 0, PAGE_W, 23, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextColor(doc, COLORS.yellow)
  doc.text('FORENSITWIN', M, 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setTextColor(doc, COLORS.white)
  doc.text(sectionTitle, PAGE_W - M, 10, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setTextColor(doc, COLORS.muted)
  doc.text(REPORT_TITLE, M, 30)

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(String(subtitle), M, 35)
  }

  setTextColor(doc, COLORS.text)
}

function drawSectionTitle(doc, title, y, subtitle = '') {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setTextColor(doc, COLORS.dark)
  doc.text(title, M, y)

  setDrawColor(doc, COLORS.yellow)
  doc.setLineWidth(1.1)
  doc.line(M, y + 3, M + 35, y + 3)

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setTextColor(doc, COLORS.muted)
    doc.text(subtitle, M, y + 10)
  }

  setTextColor(doc, COLORS.text)
  return y + (subtitle ? 18 : 11)
}

function drawFooter(doc, page, total, caseId) {
  setDrawColor(doc, COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(M, 283, PAGE_W - M, 283)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setTextColor(doc, COLORS.muted)

  doc.text(`Case: ${safe(caseId, 'Unassigned')}`, M, 289)
  doc.text(
    `Page ${page} of ${total}`,
    PAGE_W / 2,
    289,
    { align: 'center' }
  )
  doc.text(
    'First-order screening estimates only',
    PAGE_W - M,
    289,
    { align: 'right' }
  )

  setTextColor(doc, COLORS.text)
}

function drawWatermark(doc) {
  // IMAGE WATERMARK INSERTION POINT:
  // Set WATERMARK_IMAGE above to your PNG/JPEG data URL.
  // If your image is hosted online, convert it to a data URL first.
  // Do not add network fetching here; report generation should work offline.
  if (WATERMARK_IMAGE) {
    try {
      doc.saveGraphicsState()

      if (typeof doc.setGState === 'function') {
        doc.setGState(new doc.GState({ opacity: 0.12 }))
      }

      doc.addImage(
        WATERMARK_IMAGE,
        'PNG',
        47,
        105,
        116,
        78,
        undefined,
        'FAST'
      )

      doc.restoreGraphicsState()
    } catch (error) {
      console.warn('ForensiTwin watermark image could not be added:', error)
    }
  }

  // Text watermark remains visible until the image is supplied.
  doc.saveGraphicsState()

  try {
    if (typeof doc.setGState === 'function') {
      doc.setGState(new doc.GState({ opacity: 0.07 }))
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(110, 120, 128)
    doc.text('FORENSITWIN', PAGE_W / 2, 157, {
      align: 'center',
      angle: 35,
    })
  } catch {
    // The report must still generate if a jsPDF version lacks transparency.
  }

  doc.restoreGraphicsState()
}

function addParagraph(doc, text, x, y, width = CONTENT_W, options = {}) {
  const fontSize = options.fontSize || 9
  const lineHeight = options.lineHeight || 4.5

  doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  setTextColor(doc, options.color || COLORS.text)

  const lines = doc.splitTextToSize(String(text), width)
  doc.text(lines, x, y)

  setTextColor(doc, COLORS.text)
  return y + lines.length * lineHeight
}

function addLabelValue(doc, label, value, x, y, width = CONTENT_W) {
  const labelWidth = Math.min(49, width * 0.38)
  const valueWidth = width - labelWidth

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setTextColor(doc, COLORS.muted)
  doc.text(String(label), x, y)

  doc.setFont('helvetica', 'normal')
  setTextColor(doc, COLORS.text)
  const lines = doc.splitTextToSize(safe(value), valueWidth)
  doc.text(lines, x + labelWidth, y)

  return y + Math.max(6, lines.length * 4.2)
}

function drawTable(doc, headers, rows, widths, startY, options = {}) {
  let y = startY
  const rowPadding = options.rowPadding || 3
  const fontSize = options.fontSize || 7.5
  const minRowHeight = options.minRowHeight || 8
  const xStart = M

  const drawRow = (cells, isHeader = false) => {
    const prepared = cells.map((cell, index) => {
      const width = widths[index]
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
      doc.setFontSize(isHeader ? 7.5 : fontSize)
      return doc.splitTextToSize(safe(cell, '-'), width - 2 * rowPadding)
    })

    const maxLines = Math.max(1, ...prepared.map((lines) => lines.length))
    const rowHeight = Math.max(minRowHeight, maxLines * 3.6 + rowPadding * 2)

    if (y + rowHeight > 278) {
      doc.addPage()
      y = 40
      drawHeader(doc, options.continuedTitle || 'Report details', 'Continued')
      if (!isHeader) drawRow(headers, true)
    }

    let x = xStart

    prepared.forEach((lines, index) => {
      if (isHeader) {
        setFillColor(doc, COLORS.dark)
        doc.rect(x, y, widths[index], rowHeight, 'F')
        setTextColor(doc, COLORS.white)
      } else {
        if (Math.floor(y / rowHeight) % 2 === 0) {
          setFillColor(doc, [248, 249, 250])
          doc.rect(x, y, widths[index], rowHeight, 'F')
        }
        setDrawColor(doc, COLORS.line)
        doc.rect(x, y, widths[index], rowHeight)
        setTextColor(doc, COLORS.text)
      }

      doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
      doc.setFontSize(isHeader ? 7.5 : fontSize)
      doc.text(lines, x + rowPadding, y + rowPadding + 2.5)
      x += widths[index]
    })

    y += rowHeight
  }

  drawRow(headers, true)
  for (const row of rows) drawRow(row, false)

  setTextColor(doc, COLORS.text)
  return y + 4
}

function addImagePage(doc, title, subtitle, image, caseId) {
  doc.addPage()
  drawHeader(doc, title, subtitle)
  drawSectionTitle(doc, title, 48)

  if (image) {
    try {
      const format = image.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      const maxWidth = CONTENT_W
      const maxHeight = 160
      const ratio = 16 / 9
      let w = maxWidth
      let h = w / ratio

      if (h > maxHeight) {
        h = maxHeight
        w = h * ratio
      }

      doc.addImage(image, format, M + (CONTENT_W - w) / 2, 65, w, h, undefined, 'FAST')
    } catch (error) {
      console.warn(`Could not add ${title} image:`, error)
      addParagraph(doc, 'The scene image could not be embedded in this report.', M, 75)
    }
  } else {
    addParagraph(doc, 'Scene image unavailable. The 3D view did not return an image.', M, 75)
  }

  return doc
}

async function waitFrame() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  )
}

async function captureView(store, shoot, mode, title, onStatus) {
  onStatus?.(`Capturing ${title.toLowerCase()}...`)
  useStore.setState({ cameraMode: mode })
  await waitFrame()
  await new Promise((resolve) => setTimeout(resolve, 250))

  try {
    return shoot({ quality: 0.92 })
  } catch (error) {
    console.warn(`Could not capture ${title}:`, error)
    return null
  }
}

function getEvents(store) {
  const possible = [
    store.timeline,
    store.events,
    store.simulationEvents,
    store.history,
  ]

  return possible.find(Array.isArray) || []
}

function getEvidenceType(marker) {
  return safe(firstValue(marker?.kind, marker?.type, marker?.category), 'Scene marker')
}

function getEvidenceDescription(marker) {
  return safe(firstValue(marker?.note, marker?.description, marker?.label), 'No description entered')
}

function getEvidenceLocation(marker) {
  if (Number.isFinite(marker?.x) && Number.isFinite(marker?.z)) {
    return `X ${numberValue(marker.x)} m, Z ${numberValue(marker.z)} m`
  }
  return safe(marker?.location)
}

function getEvidenceSource(marker) {
  return safe(firstValue(marker?.source, marker?.origin), 'Scene')
}

function getEvidenceId(marker, index) {
  return safe(marker?.evidenceId, `E-${String(index + 1).padStart(3, '0')}`)
}

function getInvestigationStatus(caseInfo) {
  return safe(firstValue(caseInfo?.status, caseInfo?.investigationStatus), 'Not specified')
}

function getAccidentDate(caseInfo) {
  return safe(firstValue(caseInfo?.accidentDate, caseInfo?.date, caseInfo?.dateTime), 'Not recorded')
}

function getAccidentTime(caseInfo) {
  return safe(firstValue(caseInfo?.accidentTime, caseInfo?.time), 'Not recorded')
}

function getPedestrianCount(vehicles) {
  return vehicles.filter((vehicle) => {
    const type = String(vehicle?.type || '').toLowerCase()
    return type.includes('pedestrian') || type.includes('person')
  }).length
}

function drawVehicleCards(doc, vehicles, result) {
  let y = 48

  y = drawSectionTitle(
    doc,
    'Vehicle Analysis',
    y,
    'Recorded inputs and calculated estimates; missing values are not inferred.'
  )

  if (!vehicles.length) {
    addParagraph(doc, 'No vehicles or moving objects have been entered in this case.', M, y)
    return
  }

  for (let index = 0; index < vehicles.length; index++) {
    const vehicle = vehicles[index]
    const analysis = result?.per?.find((item) => item.id === vehicle.id)

    if (y > 245) {
      doc.addPage()
      drawHeader(doc, 'Vehicle Analysis', 'Continued')
      y = 43
    }

    setFillColor(doc, COLORS.light)
    doc.roundedRect(M, y, CONTENT_W, 8, 1.5, 1.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(
      `${getVehicleId(vehicle, index)} - ${getVehicleName(vehicle, index)} (${safe(vehicle.type, 'Type not recorded')})`,
      M + 3,
      y + 5.5
    )

    y += 14

    const rows = [
      ['Initial speed', Number.isFinite(Number(vehicle.speed)) ? kmh(vehicle.speed) : 'Not recorded'],
      ['Calculated skid speed', vehicle.skid > 0 && analysis ? kmh(ms2kmh(analysis.skidSpeed)) : 'Not calculated'],
      ['Equivalent barrier speed', vehicle.crush > 0 && analysis ? kmh(ms2kmh(analysis.ebs)) : 'Not calculated'],
      ['Post-impact speed estimate', vehicle.postDist > 0 && analysis ? kmh(ms2kmh(analysis.postSpeed)) : 'Not calculated'],
      ['Direction', getDirection(vehicle)],
      ['Initial position', getPosition(vehicle)],
      ['Final position', getFinalPosition(vehicle)],
      ['Braking', safe(firstValue(vehicle.braking, vehicle.brakingApplied), 'Not recorded')],
      ['Skid distance', Number(vehicle.skid) > 0 ? `${numberValue(vehicle.skid)} m` : 'Not recorded'],
      ['Damage / crush input', Number(vehicle.crush) > 0 ? `${numberValue(vehicle.crush)} m` : 'Not recorded'],
      ['Associated evidence', safe(firstValue(vehicle.evidenceIds, vehicle.evidence), 'Not linked')],
    ]

    for (const [label, value] of rows) {
      y = addLabelValue(doc, label, value, M + 2, y, CONTENT_W - 4)
    }

    y += 4
  }
}

function addSummaryPage(doc, store, caseId) {
  doc.addPage()
  drawHeader(doc, 'Case Summary', safe(store.location?.label))
  let y = drawSectionTitle(doc, 'Case Summary', 48, 'Accident case identification and recorded scene conditions.')

  const caseInfo = store.caseInfo || {}
  const env = store.env || {}
  const vehicles = store.vehicles || []
  const markers = store.markers || []
  const location = store.location || {}

  const fields = [
    ['Case ID', safe(caseInfo.number, caseId)],
    ['Report ID', `FT-${Date.now().toString(36).toUpperCase()}`],
    ['Accident date', getAccidentDate(caseInfo)],
    ['Accident time', getAccidentTime(caseInfo)],
    ['Location / address', safe(location.label)],
    ['GPS coordinates', coordinateText(location)],
    ['Investigator', safe(caseInfo.investigator)],
    ['Vehicles / moving objects', vehicles.length],
    ['Pedestrians entered as objects', getPedestrianCount(vehicles)],
    ['Weather', getEnvironmentValue(env, 'weather')],
    ['Visibility', getEnvironmentValue(env, 'visibility')],
    ['Road condition', getEnvironmentValue(env, 'roadCondition', 'road', 'surface')],
    ['Investigation status', getInvestigationStatus(caseInfo)],
    ['Evidence markers', markers.length],
    ['Report generated', GENERATED_AT.toLocaleString()],
  ]

  const colGap = 8
  const colWidth = (CONTENT_W - colGap) / 2

  for (let i = 0; i < fields.length; i += 2) {
    const left = fields[i]
    const right = fields[i + 1]
    y = Math.max(
      addLabelValue(doc, left[0], left[1], M, y, colWidth),
      right ? addLabelValue(doc, right[0], right[1], M + colWidth + colGap, y, colWidth) : y
    )
    y += 1
  }

  y += 5
  y = drawSectionTitle(doc, 'Case Notes', y)
  y = addParagraph(
    doc,
    safe(caseInfo.notes, 'No investigator notes have been entered for this case.'),
    M,
    y,
    CONTENT_W,
    { fontSize: 9 }
  )

  y += 8
  addParagraph(
    doc,
    'This document is generated from the data currently stored in ForensiTwin. A field marked "Not recorded" was not available in the case data at report generation time.',
    M,
    Math.min(y, 265),
    CONTENT_W,
    { fontSize: 8, color: COLORS.muted }
  )
}

function addOverviewTable(doc, vehicles) {
  let y = 240
  y = drawSectionTitle(doc, 'Object Position Register', y, 'Positions are shown only when present in the current case data.')

  const rows = vehicles.map((vehicle, index) => [
    getVehicleId(vehicle, index),
    getPosition(vehicle),
    getFinalPosition(vehicle),
    getDirection(vehicle),
  ])

  if (!rows.length) {
    rows.push(['-', 'Not recorded', 'Not recorded', 'Not recorded'])
  }

  drawTable(
    doc,
    ['Object', 'Initial position', 'Final position', 'Direction'],
    rows,
    [24, 57, 57, 42],
    y,
    { continuedTitle: 'Object Position Register' }
  )
}

function addSceneAnnotationLegend(doc, vehicles, markers) {
  let y = 190
  y = drawSectionTitle(doc, 'Scene Annotation Legend', y)

  const items = [
    ...vehicles.map((vehicle, index) => [
      getVehicleId(vehicle, index),
      `${getVehicleName(vehicle, index)} - ${safe(vehicle.type, 'Type not recorded')}`,
      getPosition(vehicle),
    ]),
    ...markers.map((marker, index) => [
      getEvidenceId(marker, index),
      getEvidenceType(marker),
      getEvidenceLocation(marker),
    ]),
  ]

  if (!items.length) {
    addParagraph(doc, 'No vehicle labels or evidence markers are available.', M, y)
    return
  }

  drawTable(
    doc,
    ['Label', 'Object / evidence', 'Recorded location'],
    items,
    [28, 76, 76],
    y,
    { fontSize: 7, continuedTitle: 'Scene Annotation Legend' }
  )

  // The current report interface exposes a screenshot but no verified
  // world-to-image projection. Do not draw fake positions or impact points.
  addParagraph(
    doc,
    'Annotation limitation: this legend identifies recorded scene objects. Exact on-image positions, impact point, lane numbers, direction arrows and skid paths require the scene renderer to expose world-to-image coordinates and the corresponding event data.',
    M,
    263,
    CONTENT_W,
    { fontSize: 7, color: COLORS.muted }
  )
}

function addDriverViewDetails(doc, store) {
  let y = 218
  y = drawSectionTitle(doc, "Driver's-Eye View Details", y)

  const details = [
    ['Viewpoint', safe(firstValue(store.driverViewpoint, store.activeVehicle?.name), 'V1 (default viewpoint; verify in scene)')],
    ['Time offset', safe(firstValue(store.driverTimeOffset, store.viewTime), 'Not recorded')],
    ['Visibility', getEnvironmentValue(store.env || {}, 'visibility')],
    ['Nearby objects', (store.vehicles || []).map((v, i) => getVehicleName(v, i)).join(', ') || 'Not recorded'],
  ]

  for (const [label, value] of details) {
    y = addLabelValue(doc, label, value, M, y)
  }

  addParagraph(
    doc,
    'The timestamp and viewpoint above describe the saved case state only. A time offset is not inferred from the image unless the simulation stores it.',
    M,
    Math.min(y + 2, 270),
    CONTENT_W,
    { fontSize: 7.5, color: COLORS.muted }
  )
}

function addEvidencePage(doc, markers) {
  doc.addPage()
  drawHeader(doc, 'Evidence Register')
  let y = drawSectionTitle(doc, 'Evidence Register', 48, 'Scene markers and evidence descriptions entered in the case.')

  if (!markers.length) {
    addParagraph(
      doc,
      'No evidence markers have been entered. Uploads, photographs, CCTV references and witness statements are not included unless they are stored in the case data.',
      M,
      y,
      CONTENT_W
    )
    return
  }

  const rows = markers.map((marker, index) => [
    getEvidenceId(marker, index),
    getEvidenceType(marker),
    getEvidenceDescription(marker),
    getEvidenceLocation(marker),
    getEvidenceSource(marker),
  ])

  drawTable(
    doc,
    ['ID', 'Type', 'Description', 'Location', 'Source'],
    rows,
    [22, 27, 56, 45, 30],
    y,
    { fontSize: 7, rowPadding: 2.5, continuedTitle: 'Evidence Register' }
  )

  const photoCount = markers.filter((marker) =>
    Boolean(firstValue(marker?.dataUrl, marker?.image, marker?.photo, marker?.thumbnail))
  ).length

  addParagraph(
    doc,
    `Photo attachments detected in marker data: ${photoCount}. Photo thumbnails will be embedded only when the stored image data is accessible and supported by the report generator.`,
    M,
    264,
    CONTENT_W,
    { fontSize: 7, color: COLORS.muted }
  )
}

function addTimelinePage(doc, events) {
  doc.addPage()
  drawHeader(doc, 'Accident Timeline')
  let y = drawSectionTitle(doc, 'Accident Timeline', 48, 'Events supplied by the simulation or case history.')

  if (!events.length) {
    addParagraph(
      doc,
      'No simulation-event timeline is currently available in the report data. A timeline cannot safely be inferred from the final scene image alone.',
      M,
      y,
      CONTENT_W
    )
    y += 20
    addParagraph(
      doc,
      'Recommended events to record: scene entry, approach, braking onset, skid onset, impact, post-impact movement and final rest. Each event should carry an explicit timestamp and source.',
      M,
      y,
      CONTENT_W,
      { fontSize: 8, color: COLORS.muted }
    )
    return
  }

  const rows = events.map((event, index) => [
    safe(firstValue(event.time, event.timestamp, event.t), `Event ${index + 1}`),
    safe(firstValue(event.title, event.name, event.type), 'Unspecified event'),
    safe(firstValue(event.description, event.note, event.label), 'No description'),
    safe(firstValue(event.source, event.origin), 'Simulation'),
  ])

  drawTable(
    doc,
    ['Time', 'Event', 'Description', 'Source'],
    rows,
    [29, 39, 83, 29],
    y,
    { fontSize: 7, continuedTitle: 'Accident Timeline' }
  )
}

function addPhysicsPage(doc, vehicles, store, result) {
  doc.addPage()
  drawHeader(doc, 'Physics & Calculations')
  let y = drawSectionTitle(doc, 'Physics & Calculations', 48, 'Recorded inputs, model outputs, units and interpretation.')

  const rows = []

  for (const vehicle of vehicles) {
    const analysis = result?.per?.find((item) => item.id === vehicle.id)
    const name = safe(vehicle.name, vehicle.id)

    rows.push([
      name,
      'Entered speed',
      Number.isFinite(Number(vehicle.speed)) ? kmh(vehicle.speed) : 'Not recorded',
      'User-entered input',
    ])

    if (vehicle.skid > 0 && analysis) {
      rows.push([
        name,
        'Skid-based minimum speed',
        kmh(ms2kmh(analysis.skidSpeed)),
        `Skid input: ${numberValue(vehicle.skid)} m`,
      ])
    }

    if (vehicle.crush > 0 && analysis) {
      rows.push([
        name,
        'Equivalent barrier speed',
        kmh(ms2kmh(analysis.ebs)),
        `Crush input: ${numberValue(vehicle.crush)} m`,
      ])
    }

    if (vehicle.postDist > 0 && analysis) {
      rows.push([
        name,
        'Post-impact / rest estimate',
        kmh(ms2kmh(analysis.postSpeed)),
        `Distance input: ${numberValue(vehicle.postDist)} m`,
      ])
    }
  }

  if (!rows.length) {
    rows.push(['-', 'No calculation available', 'Not calculated', 'Required inputs are missing'])
  }

  y = drawTable(
    doc,
    ['Object', 'Calculation', 'Result', 'Input / data note'],
    rows,
    [34, 51, 35, 60],
    y,
    { fontSize: 7, continuedTitle: 'Physics & Calculations' }
  )

  y += 3
  y = drawSectionTitle(doc, 'Formula and Assumptions', y)

  y = addParagraph(
    doc,
    'Calculations use the current ForensiTwin physics module. The exact formula implementation is defined in src/lib/physics.js and should be reviewed alongside the inputs before any technical or legal interpretation.',
    M,
    y,
    CONTENT_W,
    { fontSize: 8 }
  )

  y += 4
  y = addParagraph(
    doc,
    'Units: speed is shown in km/h; distance is shown in metres; energy, where calculated by the model, is shown in kilojoules. Values may be rounded for display.',
    M,
    y,
    CONTENT_W,
    { fontSize: 8 }
  )

  y += 4
  addParagraph(
    doc,
    'FIRST-ORDER SCREENING ESTIMATES ONLY. Results depend on the entered values and simplified assumptions. They are not a substitute for validated collision reconstruction, calibrated measurements or expert analysis.',
    M,
    Math.min(y, 267),
    CONTENT_W,
    { bold: true, fontSize: 8, color: COLORS.muted }
  )
}

function addScenarioPage(doc, vehicles, markers) {
  doc.addPage()
  drawHeader(doc, 'Possible Accident Scenarios')
  let y = drawSectionTitle(doc, 'Possible Accident Scenarios', 48, 'Exploratory hypotheses, not automated probability estimates.')

  const candidates = [
    {
      name: 'Scenario A - Approach speed',
      description: 'Examine whether the recorded approach speed and available braking or skid inputs are consistent with the observed scene.',
      evidence: markers.filter((m) => /skid|speed|brak/i.test(`${m.kind || ''} ${m.note || ''}`)),
    },
    {
      name: 'Scenario B - Trajectory variation',
      description: 'Examine alternative approach directions and final positions for the recorded moving objects.',
      evidence: markers.filter((m) => /position|direction|impact|path/i.test(`${m.kind || ''} ${m.note || ''}`)),
    },
    {
      name: 'Scenario C - Braking or avoidance',
      description: 'Examine whether braking or an avoidance manoeuvre is represented in the entered parameters and event data.',
      evidence: markers.filter((m) => /brak|avoid|skid/i.test(`${m.kind || ''} ${m.note || ''}`)),
    },
  ]

  for (const scenario of candidates) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(scenario.name, M, y)
    y += 6

    y = addParagraph(doc, scenario.description, M, y, CONTENT_W, { fontSize: 8 })
    y += 2

    const ids = scenario.evidence.map((marker) =>
      getEvidenceId(marker, markers.indexOf(marker))
    )

    y = addParagraph(
      doc,
      `Potentially relevant entered evidence: ${ids.join(', ') || 'No matching evidence marker identified.'}`,
      M,
      y,
      CONTENT_W,
      { fontSize: 7.5, color: COLORS.muted }
    )
    y += 7
  }

  addParagraph(
    doc,
    `Case currently contains ${vehicles.length} moving object(s) and ${markers.length} evidence marker(s). These scenario prompts are not simulation results and do not establish that any scenario occurred.`,
    M,
    Math.min(y + 3, 266),
    CONTENT_W,
    { fontSize: 8, bold: true }
  )
}

function addScenarioComparisonPage(doc) {
  doc.addPage()
  drawHeader(doc, 'Scenario Comparison')
  let y = drawSectionTitle(doc, 'Scenario Comparison', 48, 'No validated evidence-scoring engine is currently exposed to this report.')

  const rows = [
    ['Speed consistency', 'Not assessed', 'Not assessed', 'Not assessed'],
    ['Trajectory match', 'Not assessed', 'Not assessed', 'Not assessed'],
    ['Skid match', 'Not assessed', 'Not assessed', 'Not assessed'],
    ['Damage consistency', 'Not assessed', 'Not assessed', 'Not assessed'],
    ['Overall evidence match', 'Not scored', 'Not scored', 'Not scored'],
  ]

  y = drawTable(
    doc,
    ['Parameter', 'Scenario A', 'Scenario B', 'Scenario C'],
    rows,
    [54, 40, 40, 40],
    y,
    { fontSize: 7.5, continuedTitle: 'Scenario Comparison' }
  )

  y += 5
  addParagraph(
    doc,
    'A comparison score should be introduced only after the application defines measurable criteria, their data sources, treatment of missing evidence and a validation procedure. The labels above deliberately avoid unsupported High / Medium / Low scores.',
    M,
    y,
    CONTENT_W,
    { fontSize: 8 }
  )
}

function addFindingsPage(doc, vehicles, markers, caseInfo) {
  doc.addPage()
  drawHeader(doc, 'Reconstruction Findings')
  let y = drawSectionTitle(doc, 'Reconstruction Findings', 48, 'Summary of the recorded case data; not a determination of legal liability.')

  const sections = [
    ['Most consistent scenario', 'Not determined automatically. No validated scenario-ranking model is currently available in this report generator.'],
    ['Supporting evidence', markers.length ? markers.map((m, i) => `${getEvidenceId(m, i)} - ${getEvidenceDescription(m)}`).join('\n') : 'No evidence markers recorded.'],
    ['Observed reconstruction', `${vehicles.length} moving object(s) entered in the case. Refer to the scene views and vehicle analysis for the recorded inputs.`],
    ['Alternative scenarios', 'See the Possible Accident Scenarios page. Alternatives require comparison against measured evidence before any conclusion is drawn.'],
    ['Limitations', 'Unknown values remain unrecorded. The report does not independently verify measurements, image authenticity, vehicle dimensions, event timing or collision dynamics.'],
  ]

  for (const [title, value] of sections) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(title, M, y)
    y += 5

    y = addParagraph(doc, value, M, y, CONTENT_W, { fontSize: 8 })
    y += 6

    if (y > 258) {
      doc.addPage()
      drawHeader(doc, 'Reconstruction Findings', 'Continued')
      y = 42
    }
  }

  if (caseInfo.notes) {
    y += 2
    addParagraph(doc, `Investigator notes: ${caseInfo.notes}`, M, Math.min(y, 268), CONTENT_W, { fontSize: 8 })
  }
}

function addFinalNotesPage(doc, store, caseId) {
  doc.addPage()
  drawHeader(doc, 'Final Report & Investigator Notes')
  let y = drawSectionTitle(doc, 'Final Report & Investigator Notes', 48, 'Documentation, provenance and review notes.')

  const caseInfo = store.caseInfo || {}
  const env = store.env || {}

  const fields = [
    ['Investigator observations', safe(caseInfo.notes)],
    ['Assumptions', safe(firstValue(caseInfo.assumptions, store.physics?.assumptions), 'No explicit assumptions recorded.')],
    ['Data sources', safe(firstValue(caseInfo.dataSources, store.dataSources), 'Case inputs and calculations stored in ForensiTwin.')],
    ['Software version', safe(firstValue(store.appVersion, caseInfo.softwareVersion), 'Not recorded')],
    ['Report generated', GENERATED_AT.toLocaleString()],
    ['Case ID', safe(caseInfo.number, caseId)],
    ['Digital report ID', `FT-${Date.now().toString(36).toUpperCase()}`],
    ['Weather', getEnvironmentValue(env, 'weather')],
    ['Road condition', getEnvironmentValue(env, 'roadCondition', 'road', 'surface')],
  ]

  for (const [label, value] of fields) {
    y = addLabelValue(doc, label, value, M, y)
    y += 1
  }

  y += 7
  y = drawSectionTitle(doc, 'Important Disclaimer', y)

  addParagraph(
    doc,
    'This reconstruction is an analytical aid based on the data and assumptions entered into ForensiTwin. It does not independently establish legal liability and should be interpreted alongside physical evidence and expert investigation.',
    M,
    y,
    CONTENT_W,
    { bold: true, fontSize: 9, lineHeight: 5 }
  )
}

export async function generateReport({ onStatus } = {}) {
  const store = useStore.getState()
  const caseInfo = store.caseInfo || {}
  const vehicles = Array.isArray(store.vehicles) ? store.vehicles : []
  const markers = Array.isArray(store.markers) ? store.markers : []
  const location = store.location || {}
  const env = store.env || {}
  const shoot = store.screenshotFn

  if (!shoot) {
    throw new Error('The 3D view is not ready yet.')
  }

  const previousMode = store.cameraMode
  const caseId = safe(caseInfo.number, 'report').replace(/[^\w-]+/g, '_')
  const reportId = `FT-${Date.now().toString(36).toUpperCase()}`
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  let topImage = null
  let overviewImage = null
  let driverImage = null

  try {
    topImage = await captureView(store, shoot, 'top', 'Accident scene top view', onStatus)
    overviewImage = await captureView(store, shoot, 'orbit', 'Accident overview', onStatus)
    driverImage = await captureView(store, shoot, 'driver', "Driver's-eye view", onStatus)
  } finally {
    useStore.setState({ cameraMode: previousMode })
  }

  onStatus?.('Building case summary...')
  addSummaryPage(doc, { ...store, caseInfo, vehicles, markers, location, env }, caseId)

  onStatus?.('Building accident scene page...')
  addImagePage(doc, 'Accident Scene', safe(location.label), topImage, caseId)
  addSceneAnnotationLegend(doc, vehicles, markers)

  onStatus?.('Building accident overview...')
  addImagePage(doc, 'Accident Overview', safe(location.label), overviewImage, caseId)
  addOverviewTable(doc, vehicles)

  onStatus?.("Building driver's-eye view...")
  addImagePage(doc, "Driver's-Eye View", safe(location.label), driverImage, caseId)
  addDriverViewDetails(doc, store)

  onStatus?.('Building vehicle analysis...')
  doc.addPage()
  drawHeader(doc, 'Vehicle Analysis')
  drawVehicleCards(
    doc,
    vehicles,
    vehicles.length ? analyzeCase(vehicles, store.physics || {}) : { per: [] }
  )

  onStatus?.('Building evidence register...')
  addEvidencePage(doc, markers)

  onStatus?.('Building accident timeline...')
  addTimelinePage(doc, getEvents(store))

  onStatus?.('Building physics calculations...')
  addPhysicsPage(
    doc,
    vehicles,
    store,
    vehicles.length ? analyzeCase(vehicles, store.physics || {}) : { per: [] }
  )

  onStatus?.('Building possible scenarios...')
  addScenarioPage(doc, vehicles, markers)

  onStatus?.('Building scenario comparison...')
  addScenarioComparisonPage(doc)

  onStatus?.('Building reconstruction findings...')
  addFindingsPage(doc, vehicles, markers, caseInfo)

  onStatus?.('Building final notes...')
  addFinalNotesPage(doc, store, caseId)

  // Keep the existing case-report flow but correct page numbers and
  // apply the watermark to every final page, including overflow pages.
  const totalPages = doc.internal.getNumberOfPages()

  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page)
    drawWatermark(doc)
    drawFooter(doc, page, totalPages, caseInfo.number)
  }

  onStatus?.('Saving PDF report...')
  doc.setProperties({
    title: REPORT_TITLE,
    subject: `Digital accident reconstruction - ${safe(caseInfo.number, 'Unassigned case')}`,
    author: safe(caseInfo.investigator, 'ForensiTwin'),
    creator: 'ForensiTwin',
    keywords: 'ForensiTwin, accident reconstruction, evidence, case report',
  })

  doc.save(`ForensiTwin_${caseId}_${reportId}.pdf`)
}
