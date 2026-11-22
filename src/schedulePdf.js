// Draws an incoming student's class schedule as a PDF (issue #180). The student and the KU
// coordinator download it from the same data, so both get the same document.
import { loadLetterImages } from './acceptanceLetter'
import { compareCourses, coursesByDay, formatClassTimes, semesterDates, semesterName } from './classSchedule'

const labelBlue = [13, 128, 170]
const borderBlue = [17, 171, 226]
const borderYellow = [247, 216, 31]
const black = [0, 0, 0]
const muted = [85, 95, 110]
const rowShade = [236, 247, 252]
const ruleColor = [190, 214, 228]

const pageWidth = 210
const pageHeight = 297
const left = 18
const right = pageWidth - 18
const contentWidth = right - left
const footerTop = 272.5
const contentBottom = footerTop - 6

const lastUpdated = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait',
})

function studentName(application) {
  return [application.first_name, application.middle_name, application.last_name]
    .map((part) => part?.trim()).filter(Boolean).join(' ') || 'Incoming student'
}

export function schedulePdfFileName(application, cycle) {
  const semester = semesterName(cycle).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `class-schedule-${semester}-${application.application_id}.pdf`
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

function drawSectionHeading(doc, layout, title) {
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
function drawTable(doc, layout, { columns, rows }) {
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
      doc.setFont('helvetica', columns[index].bold ? 'bold' : 'normal')
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
      doc.setFont('helvetica', columns[index].bold ? 'bold' : 'normal')
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

export async function buildSchedulePdf({ application, cycle, items }) {
  if (!items?.length) throw new Error('A schedule PDF needs at least one course.')
  const [{ jsPDF }, [crest, exchangeLogo, aacsb]] = await Promise.all([import('jspdf'), loadLetterImages()])
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true })
  const name = studentName(application)
  const semester = semesterName(cycle)
  doc.setProperties({ title: `Class schedule – ${name} – ${semester}` })

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
  doc.text('CLASS SCHEDULE', pageWidth / 2, 16, { align: 'center', baseline: 'top' })
  doc.setFontSize(12)
  doc.text('EXCHANGE PROGRAMME', pageWidth / 2, 23.5, { align: 'center', baseline: 'top' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...muted)
  doc.text('Kuwait University – College of Business Administration', pageWidth / 2, 30.5, { align: 'center', baseline: 'top' })

  // Student and semester details, in the bordered label-and-value rows the acceptance letter uses.
  const details = [
    ['Name of Student:', name],
    ['Student ID:', String(application.student_id ?? 'Unavailable')],
    ['KU Semester:', semester],
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

  const updatedAt = items.map(({ updated_at }) => updated_at).filter(Boolean).sort().at(-1)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...muted)
  layout.y += 3
  const note = doc.splitTextToSize(
    `All class times are Kuwait time (Asia/Kuwait, GMT+3).${updatedAt ? ` Schedule last updated ${lastUpdated.format(new Date(updatedAt))}.` : ''}`,
    contentWidth,
  )
  doc.text(note, left, layout.y, { baseline: 'top' })
  layout.y += note.length * 4 + 7

  const courses = [...items].sort(compareCourses)
  drawSectionHeading(doc, layout, `Courses (${courses.length})`)
  drawTable(doc, layout, {
    columns: [
      { header: 'Code', width: 21, bold: true },
      { header: 'Course', width: 41 },
      { header: 'Days', width: 28 },
      { header: 'Time', width: 35 },
      { header: 'Room', width: 23 },
      { header: 'Instructor', width: 26 },
    ],
    rows: courses.map((item, index) => ({
      shaded: index % 2 === 1,
      cells: [item.course_display_code, item.course_name, item.meeting_days.join(', '), formatClassTimes(item), item.room, item.instructor],
    })),
  })

  drawSectionHeading(doc, layout, 'Weekly timetable')
  drawTable(doc, layout, {
    columns: [
      { header: 'Day', width: 25, bold: true },
      { header: 'Time', width: 35 },
      { header: 'Course', width: 78 },
      { header: 'Room', width: 36 },
    ],
    rows: coursesByDay(courses).flatMap(({ day, courses: dayCourses }, dayIndex) => dayCourses.map((item, index) => ({
      startsGroup: index === 0,
      shaded: dayIndex % 2 === 1,
      cells: [index === 0 ? day : '', formatClassTimes(item), `${item.course_display_code} · ${item.course_name}`, item.room],
    }))),
  })

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

export async function downloadSchedulePdf(schedule) {
  const doc = await buildSchedulePdf(schedule)
  doc.save(schedulePdfFileName(schedule.application, schedule.cycle))
}
