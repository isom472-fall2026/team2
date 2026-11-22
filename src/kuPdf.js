// The KU Exchange layout shared by the schedule (#180) and grade report (#181) PDFs: the
// acceptance letter's border, logos and footer, a bordered block of student details, and tables
// that continue onto new pages.
import { loadLetterImages } from './acceptanceLetter'
import { semesterDates, semesterName } from './classSchedule'

export const labelBlue = [13, 128, 170]
const borderBlue = [17, 171, 226]
const borderYellow = [247, 216, 31]
export const black = [0, 0, 0]
export const muted = [85, 95, 110]
const rowShade = [236, 247, 252]
const ruleColor = [190, 214, 228]

const pageWidth = 210
const pageHeight = 297
export const left = 18
const right = pageWidth - 18
export const contentWidth = right - left
const footerTop = 272.5
const contentBottom = footerTop - 6

export function studentName(application) {
  return [application.first_name, application.middle_name, application.last_name]
    .map((part) => part?.trim()).filter(Boolean).join(' ') || 'Incoming student'
}

export function semesterFileName(prefix, application, cycle) {
  const semester = semesterName(cycle).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${prefix}-${semester}-${application.application_id}.pdf`
}

function drawPageFrame(doc, aacsb) {
  doc.setFillColor(...borderBlue)
  doc.rect(0, 0, 2.1, pageHeight, 'F')
  doc.setFillColor(...borderYellow)
  doc.rect(0, pageHeight - 2.1, pageWidth, 2.1, 'F')

  doc.setDrawColor(...borderYellow)
  doc.setLineWidth(0.4)
  doc.line(left, footerTop, right, footerTop)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...labelBlue)
  doc.text('KUWAIT UNIVERSITY', left, footerTop + 2.5, { baseline: 'top' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...black)
  doc.text('College of Business Administration – Student Exchange Program', left, footerTop + 6, { baseline: 'top' })
  doc.text('Sabah Al Salem University City, Kuwait', left, footerTop + 9.5, { baseline: 'top' })
  doc.addImage(aacsb, 'PNG', right - 32, footerTop + 2.5, 32, 10.8)
}

// Opens the document with the logos, the heading, the student's details and a short note, and
// returns the layout that tracks where the next block goes.
export async function startKuDocument({ heading, pdfTitle, application, cycle, note }) {
  const [{ jsPDF }, [crest, exchangeLogo, aacsb]] = await Promise.all([import('jspdf'), loadLetterImages()])
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true })
  doc.setProperties({ title: `${pdfTitle} – ${studentName(application)} – ${semesterName(cycle)}` })

  const layout = {
    y: 0,
    newPage() {
      doc.addPage()
      drawPageFrame(doc, aacsb)
      this.y = 16
    },
    ensureSpace(height) {
      if (this.y + height > contentBottom) this.newPage()
    },
  }

  drawPageFrame(doc, aacsb)
  doc.addImage(crest, 'PNG', left + 2, 12.5, 12.6, 21.1)
  doc.addImage(exchangeLogo, 'PNG', right - 18.5, 16.5, 16.5, 16)
  doc.setTextColor(...black)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(heading, pageWidth / 2, 16, { align: 'center', baseline: 'top' })
  doc.setFontSize(12)
  doc.text('EXCHANGE PROGRAMME', pageWidth / 2, 23.5, { align: 'center', baseline: 'top' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...muted)
  doc.text('Kuwait University – College of Business Administration', pageWidth / 2, 30.5, { align: 'center', baseline: 'top' })

  // Student and semester details, in the bordered label-and-value rows the acceptance letter uses.
  const details = [
    ['Name of Student:', studentName(application)],
    ['Student ID:', String(application.student_id ?? 'Unavailable')],
    ['KU Semester:', semesterName(cycle)],
    ['Semester Dates:', semesterDates(cycle)],
  ]
  layout.y = 41
  doc.setDrawColor(...black)
  doc.setLineWidth(0.25)
  doc.line(left, layout.y, right, layout.y)
  for (const [label, value] of details) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    const labelWidth = doc.getTextWidth(`${label} `)
    doc.setFont('helvetica', 'normal')
    const valueLines = doc.splitTextToSize(value, contentWidth - 3.6 - labelWidth)
    const height = valueLines.length * 4.8 + 3
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...labelBlue)
    doc.text(label, left + 1.8, layout.y + 1.6, { baseline: 'top' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...black)
    doc.text(valueLines, left + 1.8 + labelWidth, layout.y + 1.6, { baseline: 'top' })
    doc.line(left, layout.y, left, layout.y + height)
    doc.line(right, layout.y, right, layout.y + height)
    layout.y += height
    doc.line(left, layout.y, right, layout.y)
  }

  layout.y += 3
  drawParagraph(doc, layout, note)
  layout.y += 4
  return { doc, layout }
}

export function drawParagraph(doc, layout, text, { size = 8.5, color = muted, bold = false } = {}) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.setTextColor(...color)
  const lines = doc.splitTextToSize(text, contentWidth)
  const lineHeight = size * 0.47
  layout.ensureSpace(lines.length * lineHeight)
  doc.text(lines, left, layout.y, { baseline: 'top', lineHeightFactor: lineHeight / (size * 25.4 / 72) })
  layout.y += lines.length * lineHeight + 1.5
}

export function drawSectionHeading(doc, layout, title) {
  layout.ensureSpace(22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...labelBlue)
  doc.text(title, left, layout.y, { baseline: 'top' })
  doc.setFillColor(...borderYellow)
  doc.rect(left, layout.y + 5.6, 14, 0.9, 'F')
  layout.y += 9
}

// Rows that do not fit move to the next page under a repeated header. A row that starts a
// group (a new day) gets a darker rule above it.
export function drawTable(doc, layout, { columns, rows }) {
  const padX = 1.6
  const padY = 1.7
  const fontSize = 8.5
  const lineHeight = 3.9
  const headerHeight = 7

  const drawHeader = () => {
    doc.setFillColor(...labelBlue)
    doc.rect(left, layout.y, contentWidth, headerHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    let x = left
    for (const column of columns) {
      doc.text(column.header.toUpperCase(), x + padX, layout.y + headerHeight / 2, { baseline: 'middle' })
      x += column.width
    }
    layout.y += headerHeight
  }

  layout.ensureSpace(headerHeight + 12)
  drawHeader()
  for (const row of rows) {
    doc.setFontSize(fontSize)
    const cellLines = row.cells.map((text, index) => {
      doc.setFont('helvetica', columns[index].bold || row.bold ? 'bold' : 'normal')
      return doc.splitTextToSize(String(text), columns[index].width - padX * 2)
    })
    const height = Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + padY * 2
    if (layout.y + height > contentBottom) {
      layout.newPage()
      drawHeader()
    }
    if (row.shaded) {
      doc.setFillColor(...rowShade)
      doc.rect(left, layout.y, contentWidth, height, 'F')
    }
    let x = left
    cellLines.forEach((lines, index) => {
      doc.setFont('helvetica', columns[index].bold || row.bold ? 'bold' : 'normal')
      doc.setTextColor(...black)
      doc.text(lines, x + padX, layout.y + padY, { baseline: 'top', lineHeightFactor: lineHeight / (fontSize * 25.4 / 72) })
      x += columns[index].width
    })
    doc.setDrawColor(...(row.startsGroup ? labelBlue : ruleColor))
    doc.setLineWidth(row.startsGroup ? 0.35 : 0.2)
    doc.line(left, layout.y, right, layout.y)
    layout.y += height
  }
  doc.setDrawColor(...labelBlue)
  doc.setLineWidth(0.35)
  doc.line(left, layout.y, right, layout.y)
  layout.y += 8
}

export function finishKuDocument(doc) {
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth / 2, footerTop + 13, { align: 'center', baseline: 'top' })
  }
  return doc
}
