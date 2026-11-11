// Asks before something is deleted for good. Focus starts on Cancel and Escape cancels, so
// the destructive button is never the one a stray Enter or Escape lands on.
export default function ConfirmDialog({ id, title, children, error, busy, confirmLabel, busyLabel, onConfirm, onCancel }) {
  return (
    <div className="cycle-delete-dialog__backdrop">
      <section
        className="cycle-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        aria-describedby={`${id}-description`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onCancel()
        }}
      >
        <span className="cycle-delete-dialog__icon" aria-hidden="true">!</span>
        <h2 id={`${id}-heading`}>{title}</h2>
        <p id={`${id}-description`}>{children}</p>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <div className="cycle-delete-dialog__actions">
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="btn btn--danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
