// The one loading screen for the website status check and the home page's planet. App shows
// it while the status is unknown and the home page shows the same screen while its planet
// loads, so a visitor sees a single continuous screen and nothing of the home page mounts
// until the site is confirmed to be live.
export default function SiteLoader({ error = false, message = 'Accessing Exchange', detail, actions }) {
  return (
    <div className={`ascend-loader${error ? ' ascend-loader--error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
      <span className="ascend-loader-mark">Kuwait University</span>
      <div className="ascend-cube" aria-hidden="true">
        <div className="ascend-cube-top" />
        <div className="ascend-cube-sides">
          {[0, 1, 2, 3].map((side) => <span key={side} style={{ '--i': side }} />)}
        </div>
      </div>
      <p>{message}</p>
      {detail && <p className="ascend-loader-detail">{detail}</p>}
      {actions && <div className="ascend-loader-actions">{actions}</div>}
    </div>
  )
}
