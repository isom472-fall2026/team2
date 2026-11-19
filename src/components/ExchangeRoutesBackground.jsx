import { useEffect, useRef } from 'react'
import { partnerUniversityCoordinates } from '../partnerUniversities'

// One point per partner university. Where each point sits is decorative, not geographic.
const PARTNER_COUNT = Object.keys(partnerUniversityCoordinates).length
// A fixed seed gives every visitor the same layout, and the same layout on every visit.
const LAYOUT_SEED = 472
const CANDIDATES_PER_POINT = 24
const GRID_SPACING = 80
const MAX_FLIGHTS = 6
const SPAWN_EVERY_MS = 750
const TRAIL = 0.3
const ARRIVAL_PULSE = 0.35
const TRAIL_SEGMENTS = 16

function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// Each point is the candidate farthest from every point already placed (best-candidate
// sampling), which spreads them evenly without lining them up on a grid.
function scatterPoints(width, height, hub) {
  const random = seededRandom(LAYOUT_SEED)
  const marginX = width * 0.04
  const marginY = height * 0.08
  const placed = [hub]
  for (let index = 0; index < PARTNER_COUNT; index += 1) {
    let best = null
    let bestDistance = -1
    for (let candidate = 0; candidate < CANDIDATES_PER_POINT; candidate += 1) {
      const x = marginX + random() * (width - marginX * 2)
      const y = marginY + random() * (height - marginY * 2)
      let nearest = Infinity
      for (const [px, py] of placed) nearest = Math.min(nearest, Math.hypot(px - x, py - y))
      if (nearest > bestDistance) {
        best = [x, y]
        bestDistance = nearest
      }
    }
    placed.push([...best, 1.3 + random() * 1.3])
  }
  return placed.slice(1)
}

// The stylesheet says where the hub sits (--routes-hub-x/y, as fractions of the area), so each
// layout can keep it clear of the sign-in card.
function buildLayout(width, height, wrapper) {
  const style = getComputedStyle(wrapper)
  const hub = [
    width * (parseFloat(style.getPropertyValue('--routes-hub-x')) || 0.5),
    height * (parseFloat(style.getPropertyValue('--routes-hub-y')) || 0.4),
  ]
  return { hub, points: scatterPoints(width, height, hub) }
}

function readPalette() {
  const style = getComputedStyle(document.documentElement)
  return {
    outbound: style.getPropertyValue('--neon').trim(),
    inbound: style.getPropertyValue('--neon-gold').trim(),
    grid: style.getPropertyValue('--text-muted').trim(),
    font: getComputedStyle(document.body).fontFamily,
    light: document.documentElement.dataset.theme === 'light',
  }
}

// Every route bows upwards, so an outbound and an inbound flight on the same route share one arc.
function routeCurve(from, to) {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy) || 1
  let nx = -dy / length
  let ny = dx / length
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const lift = length * 0.2
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2 + nx * lift, cy: (y1 + y2) / 2 + ny * lift, length }
}

function pointOnCurve(curve, t) {
  const u = 1 - t
  return [
    u * u * curve.x1 + 2 * u * t * curve.cx + t * t * curve.x2,
    u * u * curve.y1 + 2 * u * t * curve.cy + t * t * curve.y2,
  ]
}

function strokeCurve(context, curve) {
  context.beginPath()
  context.moveTo(curve.x1, curve.y1)
  context.quadraticCurveTo(curve.cx, curve.cy, curve.x2, curve.y2)
  context.stroke()
}

function drawNetwork(context, width, height, layout, colors) {
  const [hx, hy] = layout.hub
  context.clearRect(0, 0, width, height)
  context.lineWidth = 1
  context.strokeStyle = colors.grid
  context.globalAlpha = colors.light ? 0.16 : 0.1
  context.beginPath()
  for (let x = hx % GRID_SPACING; x <= width; x += GRID_SPACING) {
    context.moveTo(Math.round(x) + 0.5, 0)
    context.lineTo(Math.round(x) + 0.5, height)
  }
  for (let y = hy % GRID_SPACING; y <= height; y += GRID_SPACING) {
    context.moveTo(0, Math.round(y) + 0.5)
    context.lineTo(width, Math.round(y) + 0.5)
  }
  context.stroke()

  context.fillStyle = colors.outbound
  context.globalAlpha = 0.55
  for (const [x, y, radius] of layout.points) {
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  context.globalAlpha = 0.95
  context.beginPath()
  context.arc(hx, hy, 3, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = colors.outbound
  context.globalAlpha = 0.35
  context.beginPath()
  context.arc(hx, hy, 7, 0, Math.PI * 2)
  context.stroke()
  context.globalAlpha = 0.8
  context.fillStyle = colors.grid
  context.font = `600 11px ${colors.font}`
  // Near the right edge (phones), a label to the right would be cut off mid-word.
  const roomOnRight = hx + 64 < width
  context.textAlign = roomOnRight ? 'left' : 'right'
  context.fillText('KUWAIT', roomOnRight ? hx + 12 : hx - 12, hy + 4)
  context.textAlign = 'left'
  context.globalAlpha = 1
}

// Shown instead of the animation when the visitor asks for reduced motion.
function drawStillRoutes(context, width, height, layout, colors) {
  context.clearRect(0, 0, width, height)
  context.lineWidth = 1
  context.strokeStyle = colors.outbound
  context.globalAlpha = colors.light ? 0.16 : 0.12
  for (const point of layout.points) strokeCurve(context, routeCurve(layout.hub, point))
  context.globalAlpha = 1
}

function drawFlight(context, flight, layout, now, colors) {
  const point = layout.points[flight.point]
  const curve = flight.inbound ? routeCurve(point, layout.hub) : routeCurve(layout.hub, point)
  const progress = (now - flight.start) / flight.duration
  const color = flight.inbound ? colors.inbound : colors.outbound
  const head = Math.min(1, progress)
  const tail = Math.min(1, Math.max(0, progress - TRAIL))
  const fade = progress > 1 ? Math.max(0, 1 - (progress - 1) / ARRIVAL_PULSE) : 1

  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 1
  context.globalAlpha = (colors.light ? 0.14 : 0.09) * fade
  strokeCurve(context, curve)

  if (head > tail) {
    context.lineWidth = 1.6
    context.lineCap = 'round'
    let previous = pointOnCurve(curve, tail)
    for (let index = 1; index <= TRAIL_SEGMENTS; index += 1) {
      const next = pointOnCurve(curve, tail + ((head - tail) * index) / TRAIL_SEGMENTS)
      context.globalAlpha = (index / TRAIL_SEGMENTS) * 0.9
      context.beginPath()
      context.moveTo(previous[0], previous[1])
      context.lineTo(next[0], next[1])
      context.stroke()
      previous = next
    }
  }

  if (progress < 1) {
    const [x, y] = pointOnCurve(curve, head)
    context.globalAlpha = 0.25
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
    context.beginPath()
    context.arc(x, y, 2.2, 0, Math.PI * 2)
    context.fill()
  } else {
    const pulse = (progress - 1) / ARRIVAL_PULSE
    context.lineWidth = 1.2
    context.globalAlpha = Math.max(0, 1 - pulse) * 0.7
    context.beginPath()
    context.arc(curve.x2, curve.y2, 3 + pulse * 12, 0, Math.PI * 2)
    context.stroke()
  }
  context.globalAlpha = 1
  return progress < 1 + Math.max(TRAIL, ARRIVAL_PULSE)
}

// Students flying between Kuwait University and its partner universities: cyan for KU students
// going out, gold for incoming students arriving. The grid and points are drawn once on their own
// canvas and only the few moving routes are redrawn each frame.
export default function ExchangeRoutesBackground() {
  const wrapperRef = useRef(null)
  const networkRef = useRef(null)
  const flightsRef = useRef(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    // Held here rather than read from the refs: React clears refs on unmount before this effect's
    // cleanup runs, and the ResizeObserver fires in between as the removed wrapper shrinks to 0.
    const canvases = [networkRef.current, flightsRef.current]
    const networkContext = canvases[0].getContext('2d')
    const flightsContext = canvases[1].getContext('2d')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let colors = readPalette()
    let layout = { hub: [0, 0], points: [] }
    let frame = 0
    let lastSpawn = 0
    let lastPoint = -1
    const flights = []

    const repaint = () => {
      colors = readPalette()
      if (!width || !height) return
      drawNetwork(networkContext, width, height, layout, colors)
      if (reducedMotion) drawStillRoutes(flightsContext, width, height, layout, colors)
    }

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      width = rect.width
      height = rect.height
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      for (const canvas of canvases) {
        canvas.width = Math.round(width * pixelRatio)
        canvas.height = Math.round(height * pixelRatio)
        canvas.getContext('2d').setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      }
      layout = buildLayout(width, height, wrapper)
      repaint()
    }

    const spawn = (now, alreadyFlown = 0) => {
      let point = Math.floor(Math.random() * PARTNER_COUNT)
      if (point === lastPoint) point = (point + 1) % PARTNER_COUNT
      lastPoint = point
      const length = routeCurve(layout.hub, layout.points[point]).length
      const duration = Math.min(4200, 1600 + length * 2.2)
      flights.push({ point, inbound: Math.random() < 0.45, duration, start: now - alreadyFlown * duration })
    }

    const tick = (now) => {
      frame = window.requestAnimationFrame(tick)
      if (!width || !height) return
      if (flights.length === 0) for (const flown of [0.6, 0.35, 0.1]) spawn(now, flown)
      if (now - lastSpawn > SPAWN_EVERY_MS && flights.length < MAX_FLIGHTS) {
        spawn(now)
        lastSpawn = now
      }
      flightsContext.clearRect(0, 0, width, height)
      for (let index = flights.length - 1; index >= 0; index -= 1) {
        if (!drawFlight(flightsContext, flights[index], layout, now, colors)) flights.splice(index, 1)
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    // App sets data-theme in its own effect, which runs after this component's, so the colours
    // are re-read when the attribute changes rather than when the store does.
    const themeObserver = new MutationObserver(repaint)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    resize()
    if (!reducedMotion) frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [])

  return (
    <div ref={wrapperRef} className="exchange-routes" aria-hidden="true">
      <canvas ref={networkRef} />
      <canvas ref={flightsRef} />
      <p className="exchange-routes__legend">
        <span>KU students heading out</span>
        <span>Incoming students arriving</span>
      </p>
    </div>
  )
}
