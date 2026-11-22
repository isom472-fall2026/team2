import { useEffect, useState } from 'react'
import { readCycleApplications } from './cycleReportData'
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
    Promise.all([first.id, second.id].map(id => readCycleApplications(id, controller.signal).then(totals)))
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(cause => { if (!controller.signal.aborted) setError(getDatabaseErrorMessage(cause)) })
    return () => controller.abort()
  }, [first.id, second.id])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p role="status">Loading comparison…</p>
  const [baseline, comparison] = data
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
        <figcaption>Participation by cycle</figcaption>
        <div className="cycle-comparison-key">{[first, second].map((cycle, i) => <span key={cycle.id} data-series={i}>{cycleLabel(cycle)}</span>)}</div>
        <div className="cycle-comparison-groups">{metrics.map((label, index) => (
          <div key={label}><div className="cycle-comparison-bars">{data.map((values, series) => {
            const max = index === 2 ? 100 : Math.max(1, baseline[0], comparison[0])
            return <div key={series} data-series={series} style={{height: values[index] / max * 100 + '%'}}><span>{format.format(values[index])}{index === 2 && '%'}</span></div>
          })}</div><strong>{label}</strong></div>
        ))}</div>
      </figure>
    </>
  )
}

export default function CycleComparison({ cycles }) {
  const [ids, setIds] = useState(['', ''])
  const [first, second] = ids.map(value => cycles.find(cycle => String(cycle.id) === value))
  return (
    <section className="cycle-report cycle-comparison">
      <h2>Compare exchange cycles</h2>
      <div className="cycle-comparison-selectors">{['Baseline cycle', 'Comparison cycle'].map((label, index) => (
        <label className="cycle-report__cycle" key={label}>{label}
          <select value={ids[index]} onChange={event => setIds(ids.map((value, i) => i === index ? event.target.value : value))}>
            <option value="">Select a cycle</option>
            {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycleLabel(cycle)}</option>)}
          </select>
        </label>
      ))}</div>
      {!first || !second ? <p role="status">Select both cycles to compare them.</p>
        : first.id === second.id ? <p role="status">Choose two different exchange cycles.</p>
        : <Results key={first.id + '/' + second.id} first={first} second={second} />}
    </section>
  )
}
