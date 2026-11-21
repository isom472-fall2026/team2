// Fills the KU Exchange Letter of Acceptance template (issue #177) and draws it as a PDF.
// Positions are measured from the client's Word template so the printed letter matches it.

export const letterTypes = ['Conditional', 'Unconditional']

export const coordinatorSignatoryTitle = 'Coordinator, Student Exchange Program'

const conditionsText = {
  Conditional: 'Conditional – subject to a criminal-record certificate stamped by a Kuwaiti embassy',
  Unconditional: 'Unconditional',
}

const kuwaitTime = 'Asia/Kuwait'
const labelBlue = [13, 128, 170]
const black = [0, 0, 0]
const borderBlue = [17, 171, 226]
const borderYellow = [247, 216, 31]

function twoDigits(value) {
  return String(value).padStart(2, '0')
}

// A DATE column is a calendar day, so it is read as written rather than through a time zone.
function formatDateOnly(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function kuwaitParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: kuwaitTime, day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(new Date(value))
  const part = (type) => parts.find((entry) => entry.type === type)?.value
  return { day: Number(part('day')), month: part('month'), year: part('year') }
}

function formatLongDate(value) {
  const { day, month, year } = kuwaitParts(value)
  return `${twoDigits(day)} ${month} ${year}`
}

function formatShortDate(value) {
  const monthNumber = new Intl.DateTimeFormat('en-GB', { timeZone: kuwaitTime, month: '2-digit' }).format(new Date(value))
  const { day, year } = kuwaitParts(value)
  return `${twoDigits(day)}/${monthNumber}/${year}`
}

function formatPeriod(semester, start, end) {
  const from = kuwaitParts(start)
  const to = kuwaitParts(end)
  const months = from.year === to.year
    ? `${from.month} – ${to.month} ${to.year}`
    : `${from.month} ${from.year} – ${to.month} ${to.year}`
  return `${semester} Semester (${months})`
}

// Returns the template's placeholders filled from the application, and the labels of any
// that cannot be filled, so a letter is never issued with a blank field. The signatory may be
// someone other than the issuing coordinator, whose email stays the student's contact.
export function getAcceptanceLetterFields({ application, letterType, countries, cycles, universities, coordinator, signatory, issuedAt = new Date() }) {
  const byId = (rows, key, id) => rows.find((row) => Number(row[key]) === Number(id))
  const cycle = byId(cycles, 'id', application.semester_applied_for)
  const university = byId(universities, 'university_id', application.university_id)
  const universityCountry = university ? byId(countries, 'id', university.location)?.name : ''
  const nationality = byId(countries, 'id', application.nationality)?.name
  const studentName = [application.first_name, application.middle_name, application.last_name]
    .map((part) => part?.trim()).filter(Boolean).join(' ')

  const missing = []
  const require = (value, label) => {
    if (!value) missing.push(label)
    return value || ''
  }

  const fields = {
    studentName: require(application.first_name && application.last_name && studentName, 'student name'),
    birthDate: require(application.birthdate && formatDateOnly(application.birthdate), 'date of birth'),
    homeInstitution: require(university && universityCountry && `${universityCountry} – ${university.name}`, 'home institution and its country'),
    passportNumber: require(application.passport_number, 'passport number'),
    nationality: require(nationality, 'nationality'),
    letterDate: formatShortDate(issuedAt),
    programme: require(application.current_year_of_study && `Exchange – ${application.current_year_of_study}`, 'year of study'),
    period: require(cycle?.cycle_start && cycle?.cycle_end && formatPeriod(cycle.semester, cycle.cycle_start, cycle.cycle_end), 'semester start and end dates'),
    conditions: require(conditionsText[letterType], 'letter type'),
    startDate: cycle?.cycle_start ? formatLongDate(cycle.cycle_start) : '',
    endDate: cycle?.cycle_end ? formatLongDate(cycle.cycle_end) : '',
    coordinatorEmail: require(coordinator?.email, 'coordinator email'),
    signatoryName: require(signatory?.name?.trim(), 'signatory name'),
    signatoryTitle: require(signatory?.title?.trim(), 'signatory title'),
  }
  return { fields, missing }
}

async function readImage(fileName) {
  const response = await fetch(`${import.meta.env.BASE_URL}images/${fileName}`)
  if (!response.ok) throw new Error(`The letter image ${fileName} could not be loaded.`)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

let imagesPromise
function loadLetterImages() {
  imagesPromise ??= Promise.all([
    readImage('letter-ku-crest.png'),
    readImage('miniexchangelogo.png'),
    readImage('letter-aacsb.png'),
  ]).catch((error) => {
    imagesPromise = undefined
    throw error
  })
  return imagesPromise
}

// Body text mixes bold and regular words, so lines are wrapped word by word and, when asked,
// justified the way the template's paragraphs are.
function writeRichText(doc, segments, { x, y, width, fontSize, lineHeight, justify = false }) {
  doc.setFontSize(fontSize)
  const words = segments.flatMap(({ text, bold = false, color = black }) =>
    text.split(/(\s+)/).filter(Boolean).map((piece) => ({ text: piece, bold, color, space: /^\s+$/.test(piece) })))
  // getTextWidth applies kerning that text() does not draw, which squeezed pairs like "You will".
  const measure = (word) => {
    doc.setFont('helvetica', word.bold ? 'bold' : 'normal')
    return doc.getStringUnitWidth(word.space ? ' ' : word.text, { doKerning: false }) * fontSize / doc.internal.scaleFactor
  }

  const lines = []
  let line = []
  let lineWidth = 0
  for (const word of words) {
    const wordWidth = measure(word)
    if (word.space) {
      if (line.length) {
        line.push({ ...word, width: wordWidth })
        lineWidth += wordWidth
      }
      continue
    }
    if (line.length && lineWidth + wordWidth > width) {
      while (line.at(-1)?.space) lineWidth -= line.pop().width
      lines.push({ words: line, width: lineWidth })
      line = []
      lineWidth = 0
    }
    line.push({ ...word, width: wordWidth })
    lineWidth += wordWidth
  }
  while (line.at(-1)?.space) lineWidth -= line.pop().width
  if (line.length) lines.push({ words: line, width: lineWidth })

  lines.forEach((current, index) => {
    const gaps = current.words.filter((word) => word.space).length
    const isLast = index === lines.length - 1
    const extra = justify && !isLast && gaps ? (width - current.width) / gaps : 0
    let cursorX = x
    for (const word of current.words) {
      if (word.space) {
        cursorX += word.width + extra
        continue
      }
      doc.setFont('helvetica', word.bold ? 'bold' : 'normal')
      doc.setTextColor(...word.color)
      doc.text(word.text, cursorX, y + index * lineHeight, { baseline: 'top' })
      cursorX += word.width
    }
  })
  return lines.length * lineHeight
}

export async function buildAcceptanceLetterPdf(fields) {
  const [{ jsPDF }, [crest, exchangeLogo, aacsb]] = await Promise.all([import('jspdf'), loadLetterImages()])
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true })
  const pageWidth = 210
  const pageHeight = 297
  const left = 23
  const right = pageWidth - 18
  const width = right - left
  const bodySize = 10.5
  const bodyLine = 5.2

  doc.setProperties({ title: `Letter of Acceptance – ${fields.studentName}` })

  doc.setFillColor(...borderBlue)
  doc.rect(0, 0, 2.1, pageHeight, 'F')
  doc.setFillColor(...borderYellow)
  doc.rect(0, pageHeight - 2.1, pageWidth, 2.1, 'F')

  doc.addImage(crest, 'PNG', 25, 12.5, 12.6, 21.1)
  doc.addImage(exchangeLogo, 'PNG', 174, 16.5, 16.5, 16)

  doc.setTextColor(...black)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('LETTER OF ACCEPTANCE', pageWidth / 2, 37, { align: 'center', baseline: 'top' })
  doc.setFontSize(16)
  doc.text('EXCHANGE PROGRAMME', pageWidth / 2, 43.5, { align: 'center', baseline: 'top' })

  const rows = [
    ['Name of Student:', fields.studentName],
    ['Date of Birth:', fields.birthDate],
    ['Country and Name of Home Institution:', fields.homeInstitution],
    ['Passport N°:', fields.passportNumber],
    ['Nationality:', fields.nationality],
  ]
  let cursorY = 55
  doc.setDrawColor(...black)
  doc.setLineWidth(0.25)
  doc.line(left, cursorY, right, cursorY)
  for (const [label, value] of rows) {
    const height = writeRichText(doc, [
      { text: `${label} `, bold: true, color: labelBlue },
      { text: value },
    ], { x: left + 1.8, y: cursorY + 1.5, width: width - 3.6, fontSize: bodySize, lineHeight: bodyLine }) + 2.2
    doc.line(left, cursorY, left, cursorY + height)
    doc.line(right, cursorY, right, cursorY + height)
    cursorY += height
    doc.line(left, cursorY, right, cursorY)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(bodySize)
  doc.setTextColor(...black)
  cursorY += 4
  doc.text(fields.letterDate, right, cursorY, { align: 'right', baseline: 'top' })
  cursorY += 9
  doc.text(`Dear ${fields.studentName},`, left, cursorY, { baseline: 'top' })
  cursorY += 7.5

  cursorY += writeRichText(doc, [
    { text: 'Thank you for choosing ' },
    { text: 'Kuwait University – College of Business Administration', bold: true },
    { text: ' to pursue your studies on exchange. We are pleased to inform you that your application has been accepted as follows:' },
  ], { x: left, y: cursorY, width, fontSize: bodySize, lineHeight: bodyLine, justify: true }) + 2.5

  const bullets = [
    ['Programme:', fields.programme],
    ['Period:', fields.period],
    ['Conditions of acceptance:', fields.conditions],
    ['Start Date of the programme:', fields.startDate],
    ['End date of the programme (including final examinations):', fields.endDate],
  ]
  for (const [label, value] of bullets) {
    doc.setFillColor(...labelBlue)
    doc.circle(left + 3.4, cursorY + 2.1, 0.6, 'F')
    cursorY += writeRichText(doc, [
      { text: `${label} `, bold: true, color: labelBlue },
      { text: value },
    ], { x: left + 7.5, y: cursorY, width: width - 7.5, fontSize: bodySize, lineHeight: bodyLine }) + 1.5
  }
  cursorY += 6

  cursorY += writeRichText(doc, [
    { text: 'We will send information by email to help you prepare your exchange. You will soon receive information on ' },
    { text: 'Accommodation', bold: true },
    { text: ' to help for the search depending on the option you are interested in. Please read these carefully, especially the information on obtaining a ' },
    { text: 'visa', bold: true },
    { text: ' for non-Kuwaiti students, the ' },
    { text: 'health insurance', bold: true },
    { text: ', ' },
    { text: 'arrival dates and procedure', bold: true },
    { text: ', etc.' },
  ], { x: left, y: cursorY, width, fontSize: bodySize, lineHeight: bodyLine, justify: true }) + 3

  cursorY += writeRichText(doc, [
    { text: 'This information should cover the majority of questions you may have; however, should you have any particular points which are not mentioned, please contact your International Relations department at Home or the Student Exchange Program coordinator of the College of Business Administration, Kuwait University, at ' },
    { text: `${fields.coordinatorEmail}.` },
  ], { x: left, y: cursorY, width, fontSize: bodySize, lineHeight: bodyLine, justify: true }) + 3

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...black)
  doc.text('Looking forward to meeting you.', left, cursorY, { baseline: 'top' })
  cursorY += 8
  doc.text('Yours sincerely,', left, cursorY, { baseline: 'top' })

  // Left blank for the KU signature and stamp, which are added to the printed letter.
  cursorY += 20
  doc.setLineWidth(0.25)
  doc.line(left, cursorY, left + 75, cursorY)
  cursorY += 2
  doc.setFont('helvetica', 'bold')
  doc.text(fields.signatoryName, left, cursorY, { baseline: 'top' })
  cursorY += 5.5
  doc.setFont('helvetica', 'italic')
  doc.text(fields.signatoryTitle, left, cursorY, { baseline: 'top' })

  const footerTop = 272.5
  doc.setDrawColor(...borderYellow)
  doc.setLineWidth(0.4)
  doc.line(left, footerTop, 192, footerTop)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...labelBlue)
  doc.text('KUWAIT UNIVERSITY', left, footerTop + 2.5, { baseline: 'top' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...black)
  doc.text('College of Business Administration – Student Exchange Program', left, footerTop + 6, { baseline: 'top' })
  doc.text('Sabah Al Salem University City, Kuwait', left, footerTop + 9.5, { baseline: 'top' })
  doc.setTextColor(5, 99, 193)
  doc.textWithLink(fields.coordinatorEmail, left, footerTop + 13, { baseline: 'top', url: `mailto:${fields.coordinatorEmail}` })
  doc.addImage(aacsb, 'PNG', 160, footerTop + 2.5, 32, 10.8)

  return doc.output('blob')
}

export function acceptanceLetterFileName(application, letterType) {
  return `acceptance-letter-${letterType.toLowerCase()}-${application.application_id}.pdf`
}
