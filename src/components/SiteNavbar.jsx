import { Link } from 'react-router-dom'
import ExchangeNav from './ExchangeNav'
import { supabase } from '../supabase'
import { useAppStore } from '../stores/appStore'
import { toggleTheme } from '../themeTransition'

export default function SiteNavbar({ onHomeClick }) {
  const session = useAppStore((state) => state.session)
  const profile = useAppStore((state) => state.profile)
  const theme = useAppStore((state) => state.theme)
  const userName = profile?.name || session?.user?.user_metadata?.name || session?.user?.email

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) window.alert(error.message)
  }

  return (
    <ExchangeNav
      site
      theme={theme}
      onHomeClick={onHomeClick}
      links={
        <>
          <Link to="/">Home</Link>
          <Link to="/partners">Partner Universities</Link>
          <a href="https://www.ku.edu.kw" target="_blank" rel="noopener noreferrer">Kuwait University</a>
        </>
      }
      actions={
        <>
          {session && (
            <span className="exchange-nav-welcome" title={`Welcome, ${userName}`}>
              Welcome, <strong>{userName}</strong>
            </span>
          )}
          <button
            className="ascend-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {/* Drawn icons rather than the ☀ and ☾ characters, which render at different sizes. */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {theme === 'light'
                ? <path d="M21.16 14.11A9.4 9.4 0 0 1 9.89 2.84a9.4 9.4 0 1 0 11.27 11.27Z" />
                : <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5" /></>}
            </svg>
          </button>
          {!session && (
            <>
              <Link className="exchange-nav-portal" to="/auth/signup">Sign up</Link>
              <Link className="exchange-nav-portal" to="/auth/signin">Log in</Link>
            </>
          )}
          <Link className="exchange-nav-portal exchange-nav-portal--primary" to={session ? '/portal' : '/auth/signin'}>Portal</Link>
          {session && <button className="exchange-nav-portal" type="button" onClick={signOut}>Log out</button>}
        </>
      }
    />
  )
}
