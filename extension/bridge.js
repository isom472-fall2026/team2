// Runs on the KU Exchange site. The page cannot talk to an extension directly in every
// browser (Firefox has no externally_connectable), so this script relays messages between
// window.postMessage on the page and the extension's background script.

const api = globalThis.browser ?? globalThis.chrome
const FROM_APP = 'ku-exchange-app'
const FROM_EXTENSION = 'cba-syllabus-importer'
// Saving one subject is a file upload plus a row. Anything slower means the portal stopped
// listening, and the import must fail rather than wait forever.
const REPLY_TIMEOUT_MS = 120000

const pendingReplies = new Map()
let nextRequestId = 1

function postToPage(message) {
  window.postMessage({ source: FROM_EXTENSION, ...message }, location.origin)
}

// When the extension is removed or reloaded, Chrome leaves this script running in open tabs
// but cuts it off from the extension; runtime.id disappears at that moment.
function isConnected() {
  return Boolean(api.runtime?.id)
}

function announceReady() {
  if (isConnected()) postToPage({ type: 'ready', version: api.runtime.getManifest().version })
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return
  const message = event.data
  if (!message || message.source !== FROM_APP) return

  if (message.type === 'ping') {
    announceReady()
  } else if (message.type === 'start-import') {
    const reportStartError = (error) => {
      postToPage({ type: 'status', state: 'error', message: `The extension could not start the import: ${error.message}` })
    }
    try {
      api.runtime.sendMessage({ type: 'start-import' }).catch(reportStartError)
    } catch (error) {
      reportStartError(error)
    }
  } else if (message.type === 'reply') {
    const pending = pendingReplies.get(message.requestId)
    if (!pending) return
    pendingReplies.delete(message.requestId)
    clearTimeout(pending.timer)
    pending.respond({ ok: message.ok === true, error: message.error })
  }
})

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'app') return false
  if (!message.expectsReply) {
    postToPage(message.payload)
    return false
  }

  const requestId = nextRequestId++
  const timer = setTimeout(() => {
    pendingReplies.delete(requestId)
    sendResponse({ ok: false, error: 'The KU Exchange portal stopped responding. Keep the CBA subjects page open while the import runs.' })
  }, REPLY_TIMEOUT_MS)
  pendingReplies.set(requestId, { timer, respond: sendResponse })
  postToPage({ ...message.payload, requestId })
  return true
})

announceReady()
