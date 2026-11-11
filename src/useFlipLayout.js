import { useLayoutEffect, useRef } from 'react'

const DURATION_MS = 420
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const ANIMATION_ID = 'flip-layout'

// Where the item sits in the layout, ignoring transforms. A bounding rect would include an entrance
// animation still playing on the item, and the leftover offset would later be mistaken for a move.
function layoutPosition(item, container) {
  let left = 0
  let top = 0
  for (let node = item; node && node !== container; node = node.offsetParent) {
    left += node.offsetLeft
    top += node.offsetTop
  }
  return { left, top }
}

// After every render, any matching item that ended up in a new spot is drawn back where it was and
// released to slide into place (the FLIP technique), so content that is pushed around by fields
// appearing or disappearing moves instead of jumping. The container must be positioned (for
// example `position: relative`) so item offsets are measured from it.
export function useFlipLayout(containerRef, selector) {
  const positions = useRef(new WeakMap())
  const lastWidth = useRef(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const width = container.offsetWidth
    // A different width means the window was resized since the last render; those moves are not
    // caused by this render, so the new positions are recorded without animating.
    const animate = width === lastWidth.current
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    lastWidth.current = width

    for (const item of container.querySelectorAll(selector)) {
      // Measured before and after cancelling a slide still in flight, so an interrupted item
      // carries on from where it is on screen rather than from where it was heading.
      const shown = item.getBoundingClientRect()
      for (const animation of item.getAnimations()) {
        if (animation.id === ANIMATION_ID) animation.cancel()
      }
      const settled = item.getBoundingClientRect()
      const next = layoutPosition(item, container)
      const previous = positions.current.get(item)
      positions.current.set(item, next)
      if (!previous || !animate) continue

      const dx = previous.left + (shown.left - settled.left) - next.left
      const dy = previous.top + (shown.top - settled.top) - next.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      item.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: DURATION_MS, easing: EASING },
      ).id = ANIMATION_ID
    }
  })
}
