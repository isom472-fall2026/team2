import { flushSync } from 'react-dom'
import { useAppStore } from './stores/appStore'

// Cross-fades the whole page as one snapshot the browser composites on the GPU. Transitioning
// colours and shadows on every element instead repainted the page each frame while the planet
// was animating, which made the switch stutter. Browsers without view transitions, and visitors
// who ask for reduced motion, get an instant switch.
export function toggleTheme() {
  const apply = () => {
    // Read at apply time, not click time: a second click can arrive before the browser has
    // captured the first snapshot and run this.
    const { theme, setTheme } = useAppStore.getState()
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    // Set here as well as in App's effect so the new snapshot already has the portal styles
    // that key off the root element.
    document.documentElement.dataset.theme = nextTheme
    flushSync(() => setTheme(nextTheme))
  }
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }
  document.startViewTransition(apply)
}
