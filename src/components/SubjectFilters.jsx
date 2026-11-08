import { useId, useMemo, useState } from 'react'
import './SubjectFilters.css'

const ALL_DEPARTMENTS = ''

// People type a code as "ACC111" as often as "ACC 111", so spaces are ignored in the match.
function compact(text) {
  return text.toLowerCase().replace(/\s+/g, '')
}

// Shared by the incoming student catalog and the KU coordinator's CBA subjects tab (issue #98).
// It owns the search and department filter and hands the matching subjects to `children`.
function SubjectFilters({ subjects, children }) {
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState(ALL_DEPARTMENTS)
  const searchId = useId()
  const departmentId = useId()

  const departments = useMemo(
    () => [...new Set(subjects.map((subject) => subject.course_department))].sort((left, right) => left.localeCompare(right)),
    [subjects],
  )

  const needle = compact(search)
  const matches = subjects.filter((subject) => (
    (department === ALL_DEPARTMENTS || subject.course_department === department)
    && (!needle
      || compact(subject.course_display_code).includes(needle)
      || compact(subject.course_name).includes(needle))
  ))
  const hasFilters = needle !== '' || department !== ALL_DEPARTMENTS

  const clearFilters = () => {
    setSearch('')
    setDepartment(ALL_DEPARTMENTS)
  }

  return (
    <>
      <div className="subject-filters" role="search">
        <div className="subject-filters__field">
          <label htmlFor={searchId}>Search by course code or title</label>
          <input
            id={searchId}
            type="search"
            value={search}
            placeholder="For example ACC 111 or accounting"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="subject-filters__field">
          <label htmlFor={departmentId}>Department</label>
          <select id={departmentId} value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value={ALL_DEPARTMENTS}>All departments</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <button className="btn btn--secondary subject-filters__clear" type="button" onClick={clearFilters} disabled={!hasFilters}>
          Clear filters
        </button>
      </div>

      <p className="subject-filters__count" role="status">
        {matches.length === subjects.length
          ? `${subjects.length} courses`
          : `${matches.length} of ${subjects.length} courses`}
      </p>

      {matches.length === 0 ? <p className="subject-filters__empty">No courses found</p> : children(matches)}
    </>
  )
}

export default SubjectFilters
