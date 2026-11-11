import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const DELETE_MS = 10
const TYPE_MS = 24
const FADE_OUT_MS = 160

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Backspaces to the part the old and new text share, then types the rest, so "Sign in to the KU
// Student portal" only retypes from "KU". The finished text stays in the layout (transparent) while
// typing, so the box takes its final size at once and screen readers hear the whole text once.
export function TypedText({ text }) {
  const [shown, setShown] = useState(text)
  const shownRef = useRef(text)

  useEffect(() => {
    let current = shownRef.current
    if (current === text) return undefined
    const reducedMotion = prefersReducedMotion()
    let shared = 0
    while (shared < current.length && shared < text.length && current[shared] === text[shared]) shared += 1

    let deleting = current.length > shared
    let timer = 0
    const step = () => {
      if (reducedMotion) current = text
      else if (deleting) current = current.slice(0, -1)
      else current = text.slice(0, current.length + 1)
      if (current.length <= shared) deleting = false
      shownRef.current = current
      setShown(current)
      if (current !== text) timer = window.setTimeout(step, deleting ? DELETE_MS : TYPE_MS)
    }
    timer = window.setTimeout(step, 0)
    return () => window.clearTimeout(timer)
  }, [text])

  if (shown === text) return text
  return (
    <span className="typed-text">
      <span className="typed-text__final">{text}</span>
      <span className="typed-text__live" aria-hidden="true">
        {shown}
        <span className="typed-text__caret" />
      </span>
    </span>
  )
}

// Fades the old text out, then brings the new text in. The new text takes its place in the layout
// straight away (transparent) so anything below moves once, with the rest of the card, instead of
// shifting again when the swap happens.
export function FadeText({ text }) {
  const [shown, setShown] = useState(text)
  const [swaps, setSwaps] = useState(0)
  const boxRef = useRef(null)
  const oldRef = useRef(null)
  const lastWidth = useRef(0)
  const leaving = text !== shown

  useLayoutEffect(() => {
    const old = oldRef.current
    if (!old) {
      lastWidth.current = boxRef.current.offsetWidth
      return
    }
    // The old text keeps the width it had, so it does not rewrap inside the new text's box, and
    // stays centred where the text around it is centred (the button label).
    old.style.width = `${lastWidth.current}px`
    if (getComputedStyle(boxRef.current).textAlign === 'center') {
      old.style.left = '50%'
      old.style.marginLeft = `${-lastWidth.current / 2}px`
    }
  })

  useEffect(() => {
    if (!leaving) return undefined
    const timer = window.setTimeout(() => {
      setShown(text)
      setSwaps((count) => count + 1)
    }, prefersReducedMotion() ? 0 : FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, text])

  if (!leaving) {
    return <span key={swaps} ref={boxRef} className={`fade-text${swaps ? ' fade-text--in' : ''}`}>{shown}</span>
  }
  return (
    <span key="swapping" ref={boxRef} className="fade-text">
      <span className="fade-text__next">{text}</span>
      <span ref={oldRef} className="fade-text__old" aria-hidden="true">{shown}</span>
    </span>
  )
}
