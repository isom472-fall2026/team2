// Draws an incoming student's KU grades as a PDF (issue #181). It is offered only once every
// course on the schedule has a grade, so the GPA it shows is the whole semester's.
import { compareCourses } from './classSchedule'
import { formatPoints, gradePoints, gradeScale, isPassingGrade, lowestPassingGrade, semesterGpa } from './kuGrades'
import { black, drawParagraph, drawSectionHeading, drawTable, finishKuDocument, semesterFileName, startKuDocument } from './kuPdf'

export function gradesPdfFileName(application, cycle) {
  return semesterFileName('ku-grades', application, cycle)
}

export async function buildGradesPdf({ application, cycle, courses }) {
  if (!courses?.length) throw new Error('A grades PDF needs at least one course.')
  if (courses.some(({ letter_grade: letter }) => gradePoints(letter) === undefined)) {
    throw new Error('The grades PDF can be downloaded once every course has a grade.')
  }
  const { doc, layout } = await startKuDocument({
    heading: 'GRADE REPORT',
    pdfTitle: 'Grade report',
    application,
    cycle,
    note: 'Grades are on Kuwait University\'s 4.0 scale. The student\'s home university decides how these grades transfer to their degree.',
  })

  const sorted = [...courses].sort(compareCourses)
  drawSectionHeading(doc, layout, `Courses (${sorted.length})`)
  drawTable(doc, layout, {
    columns: [
      { header: 'Code', width: 22, bold: true },
      { header: 'Course', width: 68 },
      { header: 'Credit hours', width: 26 },
      { header: 'Grade', width: 24 },
      { header: 'Grade points', width: 34 },
    ],
    rows: sorted.map((course, index) => ({
      shaded: index % 2 === 1,
      cells: [course.course_display_code, course.course_name, course.credit_hours, course.letter_grade, formatPoints(gradePoints(course.letter_grade))],
    })),
  })

  const { gpa, credits } = semesterGpa(sorted)
  drawParagraph(doc, layout, `Semester GPA: ${formatPoints(gpa)} on ${credits} credit hours`, { size: 11, color: black, bold: true })
  layout.y += 6

  drawSectionHeading(doc, layout, 'KU grading scale')
  drawTable(doc, layout, {
    columns: [
      { header: 'Letter grade', width: 44, bold: true },
      { header: 'Grade points', width: 44 },
      { header: 'Result', width: 86 },
    ],
    rows: gradeScale.map(({ letter, points }, index) => ({
      shaded: index % 2 === 1,
      cells: [letter, formatPoints(points), letter === lowestPassingGrade ? 'Pass (lowest passing grade)' : isPassingGrade(letter) ? 'Pass' : 'Fail'],
    })),
  })
  drawParagraph(doc, layout, 'Semester GPA = the sum of (grade points × credit hours) for every graded course, divided by the total credit hours of those courses.')

  return finishKuDocument(doc)
}

export async function downloadGradesPdf(report) {
  const doc = await buildGradesPdf(report)
  doc.save(gradesPdfFileName(report.application, report.cycle))
}
