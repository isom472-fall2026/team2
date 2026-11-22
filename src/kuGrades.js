// KU's letter grades on its 4.0 scale (issue #181). The database accepts only these letters;
// the points live here, so the grades pages, the GPA and the grade report PDF agree.
export const gradeScale = [
  { letter: 'A', points: 4 },
  { letter: 'A-', points: 3.67 },
  { letter: 'B+', points: 3.33 },
  { letter: 'B', points: 3 },
  { letter: 'B-', points: 2.67 },
  { letter: 'C+', points: 2.33 },
  { letter: 'C', points: 2 },
  { letter: 'C-', points: 1.67 },
  { letter: 'D+', points: 1.33 },
  { letter: 'D', points: 1 },
  { letter: 'F', points: 0 },
]

export const lowestPassingGrade = 'D'

const pointsByLetter = new Map(gradeScale.map(({ letter, points }) => [letter, points]))
const passingLetters = new Set(gradeScale.slice(0, gradeScale.findIndex(({ letter }) => letter === lowestPassingGrade) + 1).map(({ letter }) => letter))

export function gradePoints(letter) {
  return pointsByLetter.get(letter)
}

export function isPassingGrade(letter) {
  return passingLetters.has(letter)
}

export function formatPoints(points) {
  return points.toFixed(2)
}

// Each course counts by its credit hours; a course without a grade is left out.
export function semesterGpa(courses) {
  const graded = courses.filter(({ letter_grade: letter }) => pointsByLetter.has(letter))
  const credits = graded.reduce((total, course) => total + course.credit_hours, 0)
  if (credits === 0) return null
  const weighted = graded.reduce((total, course) => total + gradePoints(course.letter_grade) * course.credit_hours, 0)
  return { gpa: weighted / credits, credits, graded: graded.length }
}
