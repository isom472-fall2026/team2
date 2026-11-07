const api = globalThis.browser ?? globalThis.chrome
const COURSES_URL = 'https://cmu-cba.ku.edu.kw/syllabus/courses/'

// Chrome stops an idle service worker between events, so the tabs of the running import
// live in session storage instead of in variables.
async function getRunningImport() {
  const { runningImport } = await api.storage.session.get('runningImport')
  return runningImport ?? null
}

async function setRunningImport(runningImport) {
  if (runningImport) await api.storage.session.set({ runningImport })
  else await api.storage.session.remove('runningImport')
}

function sendToApp(appTabId, payload, expectsReply = false) {
  return api.tabs.sendMessage(appTabId, { target: 'app', payload, expectsReply })
}

function reportStatus(appTabId, state, message, details = {}) {
  return sendToApp(appTabId, { type: 'status', state, message, ...details }).catch(() => {})
}

async function startImport(appTabId) {
  const running = await getRunningImport()
  if (running) {
    try {
      await api.tabs.update(running.sourceTabId, { active: true })
      await setRunningImport({ ...running, appTabId })
      await reportStatus(appTabId, 'opening', 'An import is already running in the CBA tab.')
      return { ok: true }
    } catch {
      await setRunningImport(null)
    }
  }

  const tab = await api.tabs.create({ url: COURSES_URL, active: true })
  await setRunningImport({ appTabId, sourceTabId: tab.id })
  await reportStatus(appTabId, 'opening', 'Opened the CBA syllabus site in a new tab.')
  return { ok: true }
}

async function failImport(running, message) {
  await setRunningImport(null)
  await reportStatus(running.appTabId, 'error', message)
  return { ok: true }
}

async function finishImport(running, sourceTabId, summary) {
  const reply = await sendToApp(running.appTabId, { type: 'finished', ...summary }, true)
    .catch(() => ({ ok: false, error: 'The KU Exchange tab was closed before the import finished.' }))
  if (!reply?.ok) return reply
  // Cleared before closing so the tab-closed listener does not report a failure.
  await setRunningImport(null)
  await api.tabs.remove(sourceTabId)
  return reply
}

async function handleMessage(message, sender) {
  if (message?.type === 'start-import') return startImport(sender.tab.id)

  const running = await getRunningImport()
  const fromImportTab = running !== null && sender.tab?.id === running.sourceTabId
  if (message?.type === 'is-import-tab') return { importing: fromImportTab }
  if (!fromImportTab) return { ok: false, error: 'This tab is not running an import.' }

  switch (message.type) {
    case 'status':
      await reportStatus(running.appTabId, message.state, message.message, { total: message.total })
      return { ok: true }
    case 'subject':
      return sendToApp(running.appTabId, { type: 'subject', subject: message.subject, file: message.file }, true)
        .catch(() => ({ ok: false, error: 'The KU Exchange tab was closed before the import finished.' }))
    case 'finished':
      return finishImport(running, sender.tab.id, { saved: message.saved, skipped: message.skipped })
    case 'failed':
      return failImport(running, message.message)
    default:
      return { ok: false, error: `Unknown message: ${message.type}` }
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(
    sendResponse,
    (error) => sendResponse({ ok: false, error: error.message }),
  )
  return true
})

// Tab events wake a stopped background, unlike a waiting page's question, so every finished
// page load in the import tab is told to start. The page's script can load a moment after the
// tab reports complete, hence the few retries.
const START_ATTEMPTS = 10
const START_RETRY_MS = 300

api.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
    const running = await getRunningImport()
    if (running?.sourceTabId !== tabId) return
    try {
      await api.tabs.sendMessage(tabId, { type: 'run-import-tab' })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS))
    }
  }
})

api.tabs.onRemoved.addListener(async (tabId) => {
  const running = await getRunningImport()
  if (running?.sourceTabId === tabId) {
    await failImport(running, 'The CBA tab was closed before the import finished.')
  }
})
