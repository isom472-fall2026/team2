// Draws an incoming student's class schedule as a PDF (issue #180). The student and the KU
// coordinator download it from the same data, so both get the same document.
import { compareCourses, coursesByDay, formatClassTimes } from './classSchedule'
import { drawSectionHeading, drawTable, finishKuDocument, semesterFileName, startKuDocument } from './kuPdf'

const lastUpdated = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait',
})

export function schedulePdfFileName(application, cycle) {
  return semesterFileName('class-schedule', application, cycle)
}

export async function buildSchedulePdf({ application, cycle, items }) {
  if (!items?.length) throw new Error('A schedule PDF needs at least one course.')
  const updatedAt = items.map(({ updated_at }) => updated_at).filter(Boolean).sort().at(-1)
  const { doc, layout } = await startKuDocument({
    heading: 'CLASS SCHEDULE',
    pdfTitle: 'Class schedule',
    application,
    cycle,
    note: `All class times are Kuwait time (Asia/Kuwait, GMT+3).${updatedAt ? ` Schedule last updated ${lastUpdated.format(new Date(updatedAt))}.` : ''}`,
  })

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

  return finishKuDocument(doc)
}

export async function downloadSchedulePdf(schedule) {
  const doc = await buildSchedulePdf(schedule)
  doc.save(schedulePdfFileName(schedule.application, schedule.cycle))
}
