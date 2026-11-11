import { useLayoutEffect, useRef } from 'react'

// Browsers cannot transition to or from `height: auto`, so the box is given an explicit height that
// follows its content and the stylesheet transitions between those heights.
export default function AnimatedHeight({ className = '', children }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current

    const fit = () => {
      const style = getComputedStyle(outer)
      const frame = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      const height = `${inner.getBoundingClientRect().height + frame}px`
      if (outer.style.height === height) return
      // Clipped only while growing, so taller content does not spill past the bottom edge, and
      // otherwise left visible so glows around buttons are not cut off at the card's edge.
      if (outer.style.height && parseFloat(style.transitionDuration) > 0) outer.dataset.resizing = ''
      outer.style.height = height
    }

    const settle = (event) => {
      if (event.target === outer && event.propertyName === 'height') delete outer.dataset.resizing
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(inner)
    outer.addEventListener('transitionend', settle)
    return () => {
      observer.disconnect()
      outer.removeEventListener('transitionend', settle)
    }
  }, [])

  return (
    <div ref={outerRef} className={`animated-height ${className}`}>
      <div ref={innerRef} className="animated-height__content">{children}</div>
    </div>
  )
}
