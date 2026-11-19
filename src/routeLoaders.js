// Shared by the routes and the links that lead to them, so a link can start fetching its page's
// code before it is followed and the first visit does not open on a blank page.
export const loadAuthPage = () => import('./components/AuthPage')
export const loadPortal = () => import('./components/Portal')

// An early fetch that fails is ignored: following the link fetches the page again.
export const preloadAuthPage = () => { loadAuthPage().catch(() => {}) }
export const preloadPortal = () => { loadPortal().catch(() => {}) }
