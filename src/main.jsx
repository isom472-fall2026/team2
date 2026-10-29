import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './dateInputs.css'
import App from './App.jsx'

// Only in production builds: in development the worker would serve stale copies of files
// Vite is still changing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      await navigator.serviceWorker.ready
      const urls = [...document.querySelectorAll('link[rel="preload"], link[rel="modulepreload"]')].map((link) => link.href)
      if (urls.length) registration.active?.postMessage({ type: 'precache', urls })
    } catch (error) {
      console.error('Unable to register the offline cache.', error)
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
