import { useEffect, useRef, useState } from 'react'
import { getCountries, getPartnerUniversities } from '../referenceData'
import { getDatabaseErrorMessage } from '../databaseErrors'
import { useAppStore } from '../stores/appStore'
import { dayMs, readCycleApplications, summarizeCycles } from './cycleReportData'
import './CycleReport.css'

const width = 840
const plotRight = width - 32
const plotTop = 57
const dayLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const creditAverage = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const palettes = {
  light: { background: '#f4faff', ink: '#10263a', muted: '#425b75', grid: '#c4d6e4', inbound: '#13816b', outbound: '#0e70a3' },
  dark: { background: '#101927', ink: '#f1f7ff', muted: '#b0c2d8', grid: '#34465d', inbound: '#5edacf', outbound: '#83beff' },
}

function countAxis(data) {
  const peak = data.reduce((largest, { count }) => Math.max(largest, count), 1)
  const unit = 10 ** Math.floor(Math.log10(peak / 4))
  const step = [1, 2, 5, 10].map((factor) => factor * unit)
    .find((value) => value >= peak / 4 && value >= 1)
  const intervals = Math.ceil(peak / step)
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => index * step)
  return { max: intervals * step, ticks }
}

function shorten(label, maxLength) {
  return label.length <= maxLength ? label : label.slice(0, maxLength - 1).trimEnd() + '…'
}

function BarPlot({ data, categoryAxis, colors, height, showPoint }) {
  const left = 284
  const bottom = height - 64
  const rowHeight = 32
  const { max, ticks } = countAxis(data)
  const x = (count) => left + count / max * (plotRight - left - 20)

  return (
    <>
      <text x={20} y={plotTop - 8} fill={colors.muted} fontSize="13">{categoryAxis}</text>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} y1={plotTop} x2={x(tick)} y2={bottom} stroke={colors.grid} />
          <text x={x(tick)} y={bottom + 21} textAnchor="middle" fill={colors.muted} fontSize="12">{tick}</text>
        </g>
      ))}
      {data.map(({ label, count }, index) => {
        const y = plotTop + index * rowHeight
        const point = `${label}: ${count} application${count === 1 ? '' : 's'}`
        return (
          <g key={label} tabIndex={0} aria-label={point}
            onPointerEnter={() => showPoint(point)} onPointerLeave={() => showPoint('')}
            onFocus={() => showPoint(point)} onBlur={() => showPoint('')}>
            <rect x={12} y={y} width={plotRight - 12} height={rowHeight} fill="transparent" />
            <text x={20} y={y + 21} fill={colors.ink} fontSize="13">{shorten(label, 35)}</text>
            <rect x={left} y={y + 7} width={x(count) - left} height={18} rx={4} fill={colors.accent} />
            <text x={x(count) + 8} y={y + 21} fill={colors.ink} fontSize="13">{count}</text>
          </g>
        )
      })}
      <text x={(left + plotRight) / 2} y={height - 17} textAnchor="middle" fill={colors.muted} fontSize="13">Applications</text>
    </>
  )
}

function DailyPlot({ data, colors, height, showPoint }) {
  const left = 65
  const right = plotRight - 16
  const bottom = height - 65
  const { ticks, max } = countAxis(data)
  const firstDay = data[0].day
  const span = (data.at(-1).day - firstDay) / dayMs
  const step = span ? (right - left) / span : 0
  const x = (day) => step ? left + (day - firstDay) / dayMs * step : (left + right) / 2
  const y = (count) => bottom - count / max * (bottom - plotTop - 20)
  const labelCount = Math.min(span + 1, 6)
  const axisDays = Array.from({ length: labelCount }, (_, i) => (
    firstDay + Math.round(i * span / Math.max(labelCount - 1, 1)) * dayMs
  ))
  const path = data.map(({ day, count, startsWindow }) => (
    `${startsWindow ? 'M' : 'L'}${x(day)},${y(count)}`
  )).join(' ')

  return (
    <>
      <text x={20} y={plotTop + 4} fill={colors.muted} fontSize="13">Submitted applications</text>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} y1={y(tick)} x2={right} y2={y(tick)} stroke={colors.grid} />
          <text x={left - 10} y={y(tick) + 4} textAnchor="end" fill={colors.muted} fontSize="12">{tick}</text>
        </g>
      ))}
      <path d={path}
        fill="none" stroke={colors.accent} strokeWidth={3} strokeLinejoin="round" />
      {data.map(({ day, count, startsWindow }) => {
        const date = new Date(day).toISOString().slice(0, 10)
        const point = `${date}: ${count} submitted application${count === 1 ? '' : 's'}`
        return (
          <g key={day} tabIndex={count > 0 ? 0 : undefined} aria-label={point}
            onPointerEnter={() => showPoint(point)} onPointerLeave={() => showPoint('')}
            onFocus={() => showPoint(point)} onBlur={() => showPoint('')}>
            <rect x={step ? x(day) - step / 2 : left} y={plotTop + 15} width={step || right - left}
              height={bottom - plotTop} fill="transparent" />
            {(count > 0 || startsWindow) && <circle cx={x(day)} cy={y(count)} r={4} fill={colors.accent} />}
          </g>
        )
      })}
      {axisDays.map((day) => (
        <text key={day} x={x(day)} y={bottom + 24} textAnchor="middle" fill={colors.muted} fontSize="12">
          {dayLabel.format(day)}
        </text>
      ))}
      <text x={(left + right) / 2} y={height - 17} textAnchor="middle" fill={colors.muted} fontSize="13">Date (Kuwait time)</text>
    </>
  )
}

async function downloadChart(svg, filename) {
  const { width, height } = svg.viewBox.baseVal
  const drawing = new XMLSerializer().serializeToString(svg)
  const imageUrl = URL.createObjectURL(new Blob([drawing], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    const scale = Math.min(2, 8192 / height)
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('PNG could not be generated')
    const pngUrl = URL.createObjectURL(png)
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function Graph({ title, file, data, categoryAxis, cycleLabel, colors }) {
  const graphic = useRef(null)
  const [error, setError] = useState('')
  const [point, setPoint] = useState('')
  const height = categoryAxis ? plotTop + data.length * 32 + 64 : 300

  async function download() {
    setError('')
    try {
      await downloadChart(graphic.current, `${file}-${cycleLabel.replace(/[^\w-]+/g, '-')}.png`)
    } catch {
      setError('Could not download the PNG. Please try again.')
    }
  }

  return (
    <figure className="cycle-report__graph">
      <figcaption>
        <h4>{title}</h4>
        {data && <button type="button" className="btn btn--secondary" onClick={download} aria-label={`Download ${title} as PNG`}>Download PNG</button>}
      </figcaption>
      {error && <p role="alert" className="auth-form__error">{error}</p>}
      {data ? (
        <div className="cycle-report__chart">
          {point && <span className="cycle-report__tooltip" aria-hidden="true">{point}</span>}
          <div className="cycle-report__plot">
            <svg ref={graphic} viewBox={`0 0 ${width} ${height}`} width={width} height={height}
              xmlns="http://www.w3.org/2000/svg" role="group" aria-label={`${title}, ${cycleLabel}`}
              fontFamily="system-ui, sans-serif">
              <rect width={width} height={height} fill={colors.background} />
              <text className="cycle-report__export-title" x={20} y={25} fontSize="17" fontWeight="600" fill={colors.ink}>{title}</text>
              <text x={plotRight} y={25} textAnchor="end" fontSize="12" fill={colors.muted}>{cycleLabel}</text>
              {categoryAxis
                ? <BarPlot data={data} categoryAxis={categoryAxis} colors={colors} height={height} showPoint={setPoint} />
                : <DailyPlot data={data} colors={colors} height={height} showPoint={setPoint} />}
            </svg>
          </div>
        </div>
      ) : <p>Set the application opening and closing dates to see daily submissions.</p>}
    </figure>
  )
}

function LeadingCategory({ label, leader }) {
  return (
    <div>
      <dt>{label}</dt>
      {leader ? (
        <dd>
          {leader.labels.join(', ')}
          <small>{leader.count} application{leader.count === 1 ? '' : 's'}{leader.labels.length > 1 ? ' each (tie)' : ''}</small>
        </dd>
      ) : <dd>Unavailable</dd>}
    </div>
  )
}

function DirectionReport({ direction, data, cycleLabel, palette }) {
  const inbound = direction === 'Inbound'
  const key = direction.toLowerCase()
  const breakdown = inbound ? 'nationality' : 'destination university'
  const colors = { ...palette, accent: palette[key] }

  return (
    <section className="cycle-report__direction" aria-labelledby={`cycle-report-${key}`}>
      <h3 id={`cycle-report-${key}`}>{direction} applications</h3>
      {data.total > 0 ? (
        <>
          <dl className="cycle-report__metrics">
            {inbound ? (
              <>
                <LeadingCategory label="Nationality with the most applications" leader={data.topNationality} />
                <LeadingCategory label="Partner university with the most applications" leader={data.topPartner} />
              </>
            ) : (
              <>
                <div>
                  <dt>Average GPA</dt>
                  <dd>{data.averageGpa === null ? 'Unavailable' : `${data.averageGpa.toFixed(2)} / 4.00`}</dd>
                </div>
                <div>
                  <dt>Average completed credits</dt>
                  <dd>{data.averageCredits === null ? 'Unavailable' : `${creditAverage.format(data.averageCredits)} credits`}</dd>
                </div>
              </>
            )}
          </dl>
          <div className="cycle-report__graphs">
            <Graph title={`${direction} applications by status`} file={`${key}-by-status`} data={data.statuses}
              categoryAxis="Status" cycleLabel={cycleLabel} colors={colors} />
            <Graph title={`${direction} applications by ${breakdown}`} file={`${key}-by-${inbound ? 'nationality' : 'destination'}`}
              data={data.breakdown} categoryAxis={inbound ? 'Nationality' : 'Destination university'} cycleLabel={cycleLabel} colors={colors} />
            <Graph title={`${direction} submissions per day`} file={`${key}-daily-submissions`}
              data={data.daily} cycleLabel={cycleLabel} colors={colors} />
          </div>
        </>
      ) : <p>No submitted {key} applications.</p>}
    </section>
  )
}

function CycleGraphs({ cycle, cycles }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const [[inbound, outbound], universities, countries] = await Promise.all([
          readCycleApplications(cycle?.id, controller.signal), getPartnerUniversities(), getCountries(),
        ])
        if (universities.error) throw universities.error
        if (countries.error) throw countries.error
        if (!controller.signal.aborted) {
          setReport(summarizeCycles(cycle ? [cycle] : cycles, inbound, outbound, universities.data, countries.data))
        }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(getDatabaseErrorMessage(loadError))
      }
    }
    load()
    return () => controller.abort()
  }, [cycle, cycles])

  if (error) return <p role="alert" className="auth-form__error">{error}</p>
  if (!report) return <p role="status">Loading KU semester graphs…</p>
  if (report.inbound.total + report.outbound.total === 0) {
    return <p role="status">{cycle ? 'No data for this KU semester' : 'No data across all KU semesters'}</p>
  }
  const palette = palettes[theme] ?? palettes.dark
  const cycleLabel = cycle ? `${cycle.semester} ${cycle.academic_year}` : 'All KU semesters'
  return (
    <>
      <DirectionReport direction="Inbound" data={report.inbound} cycleLabel={cycleLabel} palette={palette} />
      <DirectionReport direction="Outbound" data={report.outbound} cycleLabel={cycleLabel} palette={palette} />
    </>
  )
}

export default function CycleReport({ cycles }) {
  const [selection, setSelection] = useState('')
  const cycle = selection === 'all' ? null : cycles.find(({ id }) => String(id) === selection) ?? cycles[0]
  const selectionKey = cycle?.id ?? 'all'
  return (
    <section className="cycle-report" aria-labelledby="cycle-report-heading">
      <header>
        <h2 id="cycle-report-heading">KU semester graphs</h2>
        {cycles.length > 0 && (
          <div className="cycle-report__cycle">
            <label htmlFor="cycle-report-selection">KU semester</label>
            <select id="cycle-report-selection" value={selectionKey} onChange={(event) => setSelection(event.target.value)}>
              <option value="all">All KU semesters</option>
              {cycles.map(({ id, semester, academic_year }) => (
                <option key={id} value={id}>{semester} {academic_year}</option>
              ))}
            </select>
          </div>
        )}
      </header>
      {cycles.length > 0 ? <CycleGraphs key={selectionKey} cycle={cycle} cycles={cycles} /> : <p>No KU semesters are available.</p>}
    </section>
  )
}
