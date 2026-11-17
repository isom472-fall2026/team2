import { useEffect, useRef } from 'react'
import { partnerUniversityCoordinates } from '../partnerUniversities'

// A slowly turning wireframe of the home page's planet, with Kuwait University and its partner
// universities in their real places and students flying between them: cyan for KU students going
// out, gold for incoming students arriving, as on the sign-in page.
const KUWAIT = [29.2536, 47.902]
const PARTNERS = Object.values(partnerUniversityCoordinates)
const TILT = (22 * Math.PI) / 180
const DEGREES_PER_SECOND = 2.4
// Kuwait starts a little left of centre, with Europe beside it.
const START_LONGITUDE = 30
const FRAME_MS = 1000 / 30
const MAX_FLIGHTS = 3
const SPAWN_EVERY_MS = 1700
const FLIGHT_MS = 3600
const TRAIL = 0.35
const TRAIL_SEGMENTS = 14

function toVector([lat, lon]) {
  const phi = (lat * Math.PI) / 180
  const lambda = (lon * Math.PI) / 180
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)]
}

const KUWAIT_VECTOR = toVector(KUWAIT)
const PARTNER_VECTORS = PARTNERS.map(toVector)

function readPalette() {
  const style = getComputedStyle(document.documentElement)
  return {
    outbound: style.getPropertyValue('--neon').trim(),
    inbound: style.getPropertyValue('--neon-gold').trim(),
    line: style.getPropertyValue('--text-muted').trim(),
    light: document.documentElement.dataset.theme === 'light',
  }
}

// The globe turns about its axis and is tipped towards the viewer, so the northern hemisphere,
// where most partners are, faces the screen. A point with z <= 0 is on the far side.
function makeView(width, height, wrapper, longitude) {
  const style = getComputedStyle(wrapper)
  const read = (name, fallback) => parseFloat(style.getPropertyValue(name)) || fallback
  const radius = Math.max(width, height) * read('--globe-size', 0.3)
  const cx = width * read('--globe-x', 0.8)
  const cy = height * read('--globe-y', 0.6)
  const turn = (longitude * Math.PI) / 180
  const cosTurn = Math.cos(turn)
  const sinTurn = Math.sin(turn)
  const cosTilt = Math.cos(TILT)
  const sinTilt = Math.sin(TILT)
  return {
    cx,
    cy,
    radius,
    project([x, y, z], scale = 1) {
      const rx = x * cosTurn - z * sinTurn
      const rz = x * sinTurn + z * cosTurn
      const ty = y * cosTilt - rz * sinTilt
      const tz = y * sinTilt + rz * cosTilt
      return [cx + rx * radius * scale, cy - ty * radius * scale, tz]
    },
  }
}

function strokeVisible(context, view, points) {
  let drawing = false
  for (const point of points) {
    const [x, y, z] = view.project(point)
    if (z <= 0) {
      drawing = false
      continue
    }
    if (drawing) context.lineTo(x, y)
    else context.moveTo(x, y)
    drawing = true
  }
}

// The graticule never changes shape, only angle, so its points are worked out once.
const GRATICULE = (() => {
  const lines = []
  for (let lon = -180; lon < 180; lon += 20) {
    const line = []
    for (let lat = -90; lat <= 90; lat += 4) line.push(toVector([lat, lon]))
    lines.push(line)
  }
  for (let lat = -60; lat <= 60; lat += 20) {
    const line = []
    for (let lon = -180; lon <= 180; lon += 5) line.push(toVector([lat, lon]))
    lines.push(line)
  }
  return lines
})()

function drawGlobe(context, view, colors) {
  context.lineWidth = 1
  context.strokeStyle = colors.line
  context.globalAlpha = colors.light ? 0.3 : 0.32
  context.beginPath()
  for (const line of GRATICULE) strokeVisible(context, view, line)
  context.stroke()

  context.globalAlpha = colors.light ? 0.4 : 0.45
  context.beginPath()
  context.arc(view.cx, view.cy, view.radius, 0, Math.PI * 2)
  context.stroke()

  context.fillStyle = colors.outbound
  for (const vector of PARTNER_VECTORS) {
    const [x, y, z] = view.project(vector)
    if (z <= 0) continue
    // Dots fade towards the edge of the globe, which gives it depth.
    context.globalAlpha = 0.25 + z * 0.6
    context.beginPath()
    context.arc(x, y, 1.4 + z * 1.2, 0, Math.PI * 2)
    context.fill()
  }

  const [kx, ky, kz] = view.project(KUWAIT_VECTOR)
  if (kz > 0) {
    context.globalAlpha = 0.95
    context.beginPath()
    context.arc(kx, ky, 3.2, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = colors.outbound
    context.globalAlpha = 0.4
    context.beginPath()
    context.arc(kx, ky, 8, 0, Math.PI * 2)
    context.stroke()
  }
  context.globalAlpha = 1
}

// A point along the great circle between two places, lifted off the surface mid-way so the
// route reads as a flight rather than a line painted on the globe.
function routePoint(from, to, angle, t) {
  const sinAngle = Math.sin(angle) || 1
  const a = Math.sin((1 - t) * angle) / sinAngle
  const b = Math.sin(t * angle) / sinAngle
  const lift = 1 + 0.18 * Math.sin(Math.PI * t) * (angle / Math.PI)
  return [
    (a * from[0] + b * to[0]) * lift,
    (a * from[1] + b * to[1]) * lift,
    (a * from[2] + b * to[2]) * lift,
  ]
}

function drawFlight(context, view, flight, now, colors) {
  const progress = (now - flight.start) / FLIGHT_MS
  const head = Math.min(1, progress)
  const tail = Math.max(0, Math.min(1, progress - TRAIL))
  context.strokeStyle = flight.inbound ? colors.inbound : colors.outbound
  context.fillStyle = context.strokeStyle
  context.lineWidth = 1.5
  context.lineCap = 'round'

  let previous = view.project(routePoint(flight.from, flight.to, flight.angle, tail))
  for (let index = 1; index <= TRAIL_SEGMENTS; index += 1) {
    const point = view.project(routePoint(flight.from, flight.to, flight.angle, tail + ((head - tail) * index) / TRAIL_SEGMENTS))
    if (point[2] > 0 && previous[2] > 0) {
      context.globalAlpha = (index / TRAIL_SEGMENTS) * 0.85
      context.beginPath()
      context.moveTo(previous[0], previous[1])
      context.lineTo(point[0], point[1])
      context.stroke()
    }
    previous = point
  }
  if (progress < 1 && previous[2] > 0) {
    context.globalAlpha = 1
    context.beginPath()
    context.arc(previous[0], previous[1], 2, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  return progress < 1 + TRAIL
}

export default function PortalGlobeBackground() {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    // Held here rather than read from the ref: React clears refs on unmount before this effect's
    // cleanup runs, and the ResizeObserver fires in between as the removed wrapper shrinks to 0.
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let colors = readPalette()
    let frame = 0
    let lastFrame = 0
    let lastSpawn = 0
    let startedAt = 0
    let lastPartner = -1
    const flights = []

    const draw = (now) => {
      const seconds = reducedMotion ? 0 : (now - startedAt) / 1000
      const view = makeView(width, height, wrapper, START_LONGITUDE + seconds * DEGREES_PER_SECOND)
      context.clearRect(0, 0, width, height)
      drawGlobe(context, view, colors)
      for (let index = flights.length - 1; index >= 0; index -= 1) {
        if (!drawFlight(context, view, flights[index], now, colors)) flights.splice(index, 1)
      }
    }

    const spawn = (now) => {
      let partner = Math.floor(Math.random() * PARTNER_VECTORS.length)
      if (partner === lastPartner) partner = (partner + 1) % PARTNER_VECTORS.length
      lastPartner = partner
      const inbound = Math.random() < 0.45
      const from = inbound ? PARTNER_VECTORS[partner] : KUWAIT_VECTOR
      const to = inbound ? KUWAIT_VECTOR : PARTNER_VECTORS[partner]
      const dot = Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]))
      flights.push({ from, to, inbound, angle: Math.acos(dot), start: now })
    }

    const tick = (now) => {
      frame = window.requestAnimationFrame(tick)
      // The globe turns a tenth of a degree a frame, so 30 frames a second look the same as 60
      // and cost half as much.
      if (now - lastFrame < FRAME_MS || !width || !height) return
      lastFrame = now
      if (now - lastSpawn > SPAWN_EVERY_MS && flights.length < MAX_FLIGHTS) {
        spawn(now)
        lastSpawn = now
      }
      draw(now)
    }

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      width = rect.width
      height = rect.height
      // The canvas covers the whole screen, so its pixel count is capped to keep each frame cheap.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      draw(performance.now())
    }

    const repaint = () => {
      colors = readPalette()
      if (width && height) draw(performance.now())
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)
    // App sets data-theme in its own effect, which runs after this component's, so the colours
    // are re-read when the attribute changes rather than when the store does.
    const themeObserver = new MutationObserver(repaint)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    startedAt = performance.now()
    resize()
    if (!reducedMotion) frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [])

  return (
    <div ref={wrapperRef} className="portal-globe" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
