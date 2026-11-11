import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AscendHome from './components/AscendHome'
import SiteLoader from './components/SiteLoader'
import SiteNavbar from './components/SiteNavbar'
import InactivityGuard from './components/InactivityGuard'
import { supabase } from './supabase'
import { getDatabaseErrorMessage } from './databaseErrors'
import { isKuCoordinatorProfile } from './coordinatorProfile'
import { useAppStore } from './stores/appStore'
import { loadAuthPage, loadPortal, preloadAuthPage, preloadPortal } from './routeLoaders'
import './App.css'

// Everything except the home page loads on demand, so the landing page does not download
// the map, PDF and application code before it can show anything.
const ErdPage = lazy(() => import('./ErdPage'))
const Blog = lazy(() => import('./Blog'))
const OutboundApplication = lazy(() => import('./components/OutboundApplication'))
const InboundApplication = lazy(() => import('./components/InboundApplication'))
const ManageApplication = lazy(() => import('./components/CoordinatorApplications').then((module) => ({ default: module.ManageApplication })))
const TestingMode = lazy(() => import('./components/TestingMode'))
const SubjectCatalog = lazy(() => import('./components/SubjectCatalog'))
const SubjectDetail = lazy(() => import('./components/SubjectCatalog').then((module) => ({ default: module.SubjectDetail })))
const AuthRoute = lazy(loadAuthPage)
const ProtectedPortal = lazy(loadPortal)
const PartnerUniversitiesRoute = lazy(() => import('./components/PartnerDirectory'))
const TestStatusPage = lazy(() => import('./TestStatusPage'))

async function readMaintenanceMode() {
  const { data, error } = await supabase.rpc('get_maintenance_mode')
  if (error) return { mode: null, error: getDatabaseErrorMessage(error) }
  if (data === null) {
    return {
      mode: null,
      error: 'Coordinator maintenance statuses are inconsistent. A KU coordinator must reconcile them before the website status can be confirmed.',
    }
  }
  if (typeof data !== 'boolean') {
    return { mode: null, error: 'The maintenance status returned an unexpected value.' }
  }
  return { mode: data, error: '' }
}

// Every visitor sees only this while maintenance mode is on. The sign-in sits in the corner
// because it is for KU coordinators, who sign in to switch maintenance off.
function MaintenanceScreen({
  theme,
  isKuCoordinator,
  isUpdatingMaintenance,
  maintenanceError,
  onDisableMaintenance,
  onSignOut,
}) {
  return (
    <div className="ascend-home" data-theme={theme}>
      <main className="maintenance-screen" aria-labelledby="maintenance-heading">
        {!isKuCoordinator && <Link className="maintenance-screen__signin" to="/auth/signin">KU coordinator sign in</Link>}
        <div className="maintenance-screen__message">
          <span className="ascend-loader-mark">Kuwait University</span>
          <h1 id="maintenance-heading">System is in maintenance</h1>
          <p>Please check back later.</p>
          {isKuCoordinator && (
            <div className="maintenance-screen__actions">
              <button className="btn btn--primary" type="button" onClick={onDisableMaintenance} disabled={isUpdatingMaintenance}>
                {isUpdatingMaintenance ? 'Disabling maintenance mode...' : 'Disable maintenance mode'}
              </button>
              <button className="btn btn--secondary" type="button" onClick={onSignOut}>Log out</button>
              {maintenanceError && <p className="auth-form__error" role="alert">{maintenanceError}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// Shown on every route while the website status is unknown, in the same look as the home
// page's loader, so the check reads as one screen wherever a visitor lands.
function StatusLoader({ theme, error, onRetry }) {
  return (
    <div className="ascend-home" data-theme={theme}>
      {error
        ? (
            <SiteLoader
              error
              message="We could not check the website status."
              detail={error}
              actions={
                <>
                  <button type="button" onClick={onRetry}>Retry</button>
                  <Link to="/auth/signin">KU coordinator sign in</Link>
                </>
              }
            />
          )
        : <SiteLoader />}
    </div>
  )
}

function ManageApplicationRoute({ type }) {
  const userEmail = useAppStore((state) => state.session?.user.email)
  const profile = useAppStore((state) => state.profile)

  if (!profile) return <section className="portal-page"><div className="portal-card"><p role="status">Loading coordinator account...</p></div></section>
  if (profile.role !== 'coordinator' || !isKuCoordinatorProfile(profile, userEmail)) return <Navigate to="/portal" replace />
  return <Suspense fallback={null}><ManageApplication key={type} type={type} /></Suspense>
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__section">
          <h4 className="footer__heading">Main Links</h4>
          <ul className="footer__links">
            <li><a href="#" className="footer__link">Contact Us</a></li>
            <li><Link to="/blog" className="footer__link">Blog</Link></li>
          </ul>
        </div>
        <div className="footer__section">
          <h4 className="footer__heading">Legacy Documents</h4>
          <ul className="footer__links">
            <li><a href={`${import.meta.env.BASE_URL}docs/proposal.html`} className="footer__link">Proposal</a></li>
            <li>            <Link to="/erd" className="footer__link">Schema and ERD</Link></li>
            <li><Link to="/test-status" className="footer__link">Test and Status</Link></li>
            <li><Link to="/testing-mode" className="footer__link">Testing mode</Link></li>
          </ul>
        </div>
      </div>
      <p className="footer__text">
        © {new Date().getFullYear()} Kuwait University · College of Business Administration ·
        International Relations Office
      </p>
    </footer>
  )
}

function App() {
  const { pathname } = useLocation()
  const isAscendHome = pathname === '/'
  const session = useAppStore((state) => state.session)
  const profile = useAppStore((state) => state.profile)
  const theme = useAppStore((state) => state.theme)
  const maintenanceMode = useAppStore((state) => state.maintenanceMode)
  const maintenanceStatusError = useAppStore((state) => state.maintenanceStatusError)
  const setSession = useAppStore((state) => state.setSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const setMaintenanceMode = useAppStore((state) => state.setMaintenanceMode)
  const setMaintenanceStatusError = useAppStore((state) => state.setMaintenanceStatusError)
  const setTestingMode = useAppStore((state) => state.setTestingMode)
  const [sessionEndedMessage, setSessionEndedMessage] = useState('')
  const [maintenanceControlError, setMaintenanceControlError] = useState('')
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false)

  const refreshMaintenanceStatus = useCallback(async () => {
    setMaintenanceStatusError('')
    const result = await readMaintenanceMode()
    setMaintenanceMode(result.mode)
    setMaintenanceStatusError(result.error)
  }, [setMaintenanceMode, setMaintenanceStatusError])

  useEffect(() => {
    let isCurrent = true
    readMaintenanceMode().then((result) => {
      if (!isCurrent) return
      setMaintenanceMode(result.mode)
      setMaintenanceStatusError(result.error)
    })
    return () => {
      isCurrent = false
    }
  }, [setMaintenanceMode, setMaintenanceStatusError])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('team2-theme', theme)
  }, [theme])

  // A visitor's next stop is usually the sign-in page, or the portal once signed in, so that
  // code is fetched while the browser is idle. It waits for the website status so it never
  // competes with that check, and it is skipped when the visitor has asked to save data.
  const signedIn = Boolean(session)
  useEffect(() => {
    if (maintenanceMode === null || navigator.connection?.saveData) return undefined
    const preload = () => {
      preloadAuthPage()
      if (signedIn) preloadPortal()
    }
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 5000 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timeoutId = window.setTimeout(preload, 2000)
    return () => window.clearTimeout(timeoutId)
  }, [maintenanceMode, signedIn])

  useEffect(() => {
    const loadProfile = async (nextSession) => {
      if (useAppStore.getState().authVerificationPending) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        return
      }
      const userType = nextSession.user.user_metadata?.user_type || nextSession.user.user_metadata?.student_type
      let profileTables
      if (useAppStore.getState().maintenanceMode === true || userType === 'coordinator') {
        profileTables = [['coordinator', 'coordinator_id']]
      } else if (userType === 'incoming') {
        profileTables = [['incomingstudentauth', 'student_id']]
      } else if (userType === 'ku') {
        profileTables = [['kustudentauth', 'student_id']]
      } else {
        profileTables = [['kustudentauth', 'student_id'], ['incomingstudentauth', 'student_id'], ['coordinator', 'coordinator_id']]
      }
      for (const [table] of profileTables) {
        const { data } = await supabase.from(table).select('*').eq('user_id', nextSession.user.id).maybeSingle()
        if (useAppStore.getState().authVerificationPending) return
        if (data) {
          const role = table === 'coordinator' ? 'coordinator' : table === 'incomingstudentauth' ? 'incoming' : 'ku'
          setProfile({ ...data, role })
          return
        }
      }
      setProfile({ name: nextSession.user.user_metadata?.name, role: userType })
    }

    // The listener reports the stored session as INITIAL_SESSION, so no separate getSession()
    // call is needed. Supabase runs this callback while holding its auth lock, and a query
    // started inside it can wait on that lock, so the lookup runs after the callback returns.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => loadProfile(nextSession), 0)
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [setProfile, setSession])

  const signedInKuCoordinator = Boolean(
    session && profile && isKuCoordinatorProfile(profile, session.user.email),
  )

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) window.alert(error.message)
  }

  const handleDisableMaintenance = async () => {
    if (isUpdatingMaintenance) return
    setIsUpdatingMaintenance(true)
    setMaintenanceControlError('')
    const { data, error } = await supabase.rpc('set_maintenance_mode', {
      requested_mode: false,
    })
    setIsUpdatingMaintenance(false)
    if (error) {
      setMaintenanceControlError(getDatabaseErrorMessage(error))
      return
    }
    if (data !== false) {
      setMaintenanceControlError('The database did not confirm that maintenance mode was disabled.')
      return
    }
    setMaintenanceMode(false)
    setMaintenanceStatusError('')
  }

  const handleDeleted = () => {
    window.location.hash = '/auth/signin'
  }

  const siteOpen = maintenanceMode === false
  if (maintenanceMode === true && signedInKuCoordinator) {
    return (
      <MaintenanceScreen
        theme={theme}
        isKuCoordinator
        isUpdatingMaintenance={isUpdatingMaintenance}
        maintenanceError={maintenanceControlError}
        onDisableMaintenance={handleDisableMaintenance}
        onSignOut={handleSignOut}
      />
    )
  }
  if (!siteOpen && pathname !== '/auth/signin') {
    return maintenanceMode === null
      ? <StatusLoader theme={theme} error={maintenanceStatusError} onRetry={refreshMaintenanceStatus} />
      : <MaintenanceScreen theme={theme} isKuCoordinator={false} />
  }

  return (
    <>
      {siteOpen && !isAscendHome && <SiteNavbar />}
      <main>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<AscendHome />} />
            <Route path="/auth/signup" element={maintenanceMode !== false ? <Navigate to="/auth/signin" replace /> : <AuthRoute mode="signup" />} />
            <Route path="/auth/signin" element={<AuthRoute mode="signin" coordinatorOnly={maintenanceMode !== false} sessionEndedMessage={sessionEndedMessage} onSessionNoticeDismiss={() => setSessionEndedMessage('')} />} />
            {/* Every route in this group needs a signed-in visitor; anyone else is sent to sign in. */}
            <Route element={session ? <Outlet /> : <Navigate to="/auth/signin" replace />}>
              <Route path="/portal/password" element={<ProtectedPortal passwordOnly onSignOut={handleSignOut} onDeleted={handleDeleted} onRetryMaintenanceStatus={refreshMaintenanceStatus} />} />
              <Route path="/portal" element={<ProtectedPortal onSignOut={handleSignOut} onDeleted={handleDeleted} onRetryMaintenanceStatus={refreshMaintenanceStatus} />} />
              <Route path="/portal/inbound-application/*" element={<InboundApplication />} />
              <Route path="/portal/outbound-application/*" element={<OutboundApplication />} />
              <Route path="/portal/subjects" element={<SubjectCatalog />} />
              <Route path="/portal/subjects/:courseCode" element={<SubjectDetail />} />
              <Route path="/portal/applications/outbound/:applicationId" element={<ManageApplicationRoute type="outbound" />} />
              <Route path="/portal/applications/inbound/:applicationId" element={<ManageApplicationRoute type="inbound" />} />
            </Route>
            <Route path="/partners" element={<PartnerUniversitiesRoute />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/erd" element={<ErdPage />} />
            <Route path="/test-status" element={<TestStatusPage />} />
            <Route path="/testing-mode" element={
              <TestingMode
                isKuCoordinator={signedInKuCoordinator}
                maintenanceMode={maintenanceMode}
                onTestingModeChanged={setTestingMode}
              />
            } />
          </Routes>
        </Suspense>
      </main>
      {signedInKuCoordinator && <InactivityGuard key={session.user.id} onSessionEnded={setSessionEndedMessage} />}
      {siteOpen && !isAscendHome && <Footer />}
    </>
  )
}

export default App
