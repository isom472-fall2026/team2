import { useEffect, useState } from 'react'

// The scroll position lives here rather than in the application wizard: held there, every
// scroll frame re-rendered the whole form. Shared by the inbound and outbound wizards.
export default function WizardProgress({ steps, pageIndex, pageContentRef, wizardScrollRef }) {
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const pageContent = pageContentRef.current
    const wizardScroller = wizardScrollRef.current
    if (!pageContent || !wizardScroller) return undefined

    let animationFrame = 0
    pageContent.scrollTop = 0
    wizardScroller.scrollTop = 0
    const updateProgress = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const fieldScrollDistance = Math.max(0, pageContent.scrollHeight - pageContent.clientHeight)
        const pageScrollDistance = Math.max(0, wizardScroller.scrollHeight - wizardScroller.clientHeight)
        const windowScrollDistance = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const totalScrollDistance = fieldScrollDistance + pageScrollDistance + windowScrollDistance
        if (totalScrollDistance === 0) {
          setScrollProgress(100)
          return
        }

        const progress = ((pageContent.scrollTop + wizardScroller.scrollTop + window.scrollY) / totalScrollDistance) * 100
        setScrollProgress(Math.max(0, Math.min(100, progress)))
      })
    }

    updateProgress()
    window.addEventListener('resize', updateProgress)
    window.addEventListener('scroll', updateProgress, { passive: true })
    wizardScroller.addEventListener('scroll', updateProgress, { passive: true })
    pageContent.addEventListener('scroll', updateProgress, { passive: true })
    const resizeObserver = new ResizeObserver(updateProgress)
    resizeObserver.observe(pageContent)
    resizeObserver.observe(wizardScroller)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', updateProgress)
      window.removeEventListener('scroll', updateProgress)
      wizardScroller.removeEventListener('scroll', updateProgress)
      pageContent.removeEventListener('scroll', updateProgress)
      resizeObserver.disconnect()
    }
  }, [pageContentRef, wizardScrollRef])

  return (
    <nav className="outbound-progress" aria-label="Application progress">
      {steps.map((item, index) => (
        <div className="outbound-progress__step" key={item.title} aria-current={pageIndex === index ? 'step' : undefined}>
          <span className="outbound-progress__label">
            <span className="outbound-progress__number">{String(index + 1).padStart(2, '0')}</span>
            <span className="outbound-progress__title"> · {item.title}</span>
          </span>
          <span className="outbound-progress__track" aria-hidden="true">
            <span
              className="outbound-progress__fill"
              style={{ '--outbound-progress': `${index < pageIndex ? 100 : index === pageIndex ? scrollProgress : 0}%` }}
            />
          </span>
        </div>
      ))}
    </nav>
  )
}
