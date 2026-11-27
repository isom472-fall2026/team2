import { useEffect, useState } from 'react'
import { readCycleApplications, weeklySubmissions } from './cycleReportData'
import { getDatabaseErrorMessage } from '../databaseErrors'
import './CycleReport.css'
import './CycleComparison.css'

const metrics = ['Submitted applications', 'Approved applications', 'Approval rate']
const format = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const signed = new Intl.NumberFormat('en', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })

function cycleLabel(cycle) {
  return cycle.semester + ' ' + cycle.academic_year
}

function totals(groups) {
  const applications = groups.flat()
  const approved = applications.filter(({ application_status }) => ['Approved', 'Accepted'].includes(application_status)).length
  return [applications.length, approved, applications.length ? approved * 100 / applications.length : 0]
}

function Results({ first, second }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([first.id, second.id].map(id => readCycleApplications(id, controller.signal)))
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(cause => { if (!controller.signal.aborted) setError(getDatabaseErrorMessage(cause)) })
    return () => controller.abort()
  }, [first.id, second.id])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p role="status">Loading comparison…</p>
  const cycles = [first, second]
  const overall = data.map(totals)
  const [baseline, comparison] = overall
  const weeks = cycles.map((cycle, i) => weeklySubmissions(cycle, data[i]))
  const weekCount = Math.max(...weeks.map(series => series?.length ?? 0))
  return (
    <>
      <div className="cycle-comparison-scroll">
        <table>
          <caption>Change from {cycleLabel(first)} to {cycleLabel(second)}</caption>
          <thead><tr>{['Metric', cycleLabel(first), cycleLabel(second), 'Change', 'Relative change'].map((label, index) => <th scope="col" key={index}>{label}</th>)}</tr></thead>
          <tbody>{metrics.map((metric, index) => {
            const start = baseline[index]
            const end = comparison[index]
            const difference = end - start
            const unit = index === 2 ? '%' : ''
            return <tr key={metric}>
              <th scope="row">{metric}</th><td>{format.format(start)}{unit}</td><td>{format.format(end)}{unit}</td>
              <td>{signed.format(difference)}{unit && ' pp'}</td>
              <td>{start ? signed.format(difference * 100 / start) + '%' : end ? 'N/A (zero baseline)' : '0%'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <figure className="cycle-comparison-chart">
        <figcaption>Participation by KU semester</figcaption>
        <div className="cycle-comparison-key">{[first, second].map((cycle, i) => <span key={cycle.id} data-series={i}>{cycleLabel(cycle)}</span>)}</div>
        <div className="cycle-comparison-groups">{metrics.map((label, index) => (
          <div key={label}><div className="cycle-comparison-bars">{overall.map((values, series) => {
            const max = index === 2 ? 100 : Math.max(1, baseline[0], comparison[0])
            return <div key={series} data-series={series} style={{height: values[index] / max * 100 + '%'}}><span>{format.format(values[index])}{index === 2 && '%'}</span></div>
          })}</div><strong>{label}</strong></div>
        ))}</div>
      </figure>
      <div className="cycle-comparison-scroll">
        <table>
          <caption>Inbound and outbound participation</caption>
          <thead><tr>{['Direction', 'KU semester', ...metrics].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{['Inbound', 'Outbound'].map((direction, group) => cycles.map((cycle, index) => {
            const [submitted, approved, rate] = totals([data[index][group]])
            return <tr key={direction + cycle.id}><th scope="row">{direction}</th><td>{cycleLabel(cycle)}</td>
              <td>{submitted}</td><td>{approved}</td><td>{format.format(rate)}%</td></tr>
          }))}</tbody>
        </table>
      </div>
      <section aria-label="Weekly submission trend">
        <h3>Submissions by week</h3>
        <p>Week 1 starts when applications for each KU semester open. Counts stop when applications close or today, whichever comes first.</p>
        {weeks.map((series, i) => series === null
          ? <p key={cycles[i].id}>{cycleLabel(cycles[i])} has no valid application window.</p>
          : series.length === 0 && <p key={cycles[i].id}>{cycleLabel(cycles[i])} has not opened yet.</p>)}
        {weekCount > 0 && <div className="cycle-comparison-scroll"><table>
          <caption>Weekly submissions from opening day</caption>
          <thead><tr><th scope="col">Week</th>{cycles.map(cycle => <th scope="col" key={cycle.id}>{cycleLabel(cycle)}</th>)}</tr></thead>
          <tbody>{Array.from({ length: weekCount }, (_, week) => <tr key={week}>
            <th scope="row">{week + 1}</th>{weeks.map((series, i) => <td key={cycles[i].id}>{series?.[week] ?? '—'}</td>)}
          </tr>)}</tbody>
        </table><small>— indicates a week outside the observed application window.</small></div>}
      </section>
    </>
  )
}

export default function CycleComparison({ cycles }) {
  const [ids, setIds] = useState(['', ''])
  const [first, second] = ids.map(value => cycles.find(cycle => String(cycle.id) === value))
  return (
    <section className="cycle-report cycle-comparison">
      <h2>Compare KU semesters</h2>
      <div className="cycle-comparison-selectors">{['Baseline KU semester', 'Comparison KU semester'].map((label, index) => (
        <label className="cycle-report__cycle" key={label}>{label}
          <select value={ids[index]} onChange={event => setIds(ids.map((value, i) => i === index ? event.target.value : value))}>
            <option value="">Select a KU semester</option>
            {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycleLabel(cycle)}</option>)}
          </select>
        </label>
      ))}</div>
      {!first || !second ? <p role="status">Select both KU semesters to compare them.</p>
        : first.id === second.id ? <p role="status">Choose two different KU semesters.</p>
        : <Results key={first.id + '/' + second.id} first={first} second={second} />}
    </section>
  )
}
