// Runs on every cmu-cba.ku.edu.kw page, but only acts in the tab the import opened. It runs
// as soon as the page's HTML is read (document_end): the course list is in that HTML, and
// waiting for the whole page, analytics included, held the import back by seconds.

const api = globalThis.browser ?? globalThis.chrome
const COURSES_PATH = '/syllabus/courses/'
const LOGIN_PATH = '/accounts/microsoft/login/'
const COURSE_LINK = /^\/syllabus\/courses\/(\d{4})\/(\d{3})\/$/
// A few courses at a time keeps the import to a few minutes without flooding the CBA site.
const PARALLEL_COURSES = 3
// The login page shows the same Continue button whether or not the user is signed in, and
// a sign-in can finish without this tab navigating, so the tab asks the site itself.
const SIGN_IN_CHECK_MS = 1000
// A question sent while the background is waking up can go unanswered, so the tab asks
// again every quarter second, for up to a minute, until it gets a reply.
const IMPORT_TAB_CHECK_MS = 250
const IMPORT_TAB_CHECK_ATTEMPTS = 240
// The import starts the moment the tab lands back on the CBA site, and right after the
// Microsoft sign-in the site can still answer a page as if the user were signed out. A
// sign-in redirect is retried a few times before the import decides the sign-in ended.
const SIGNED_OUT_RETRIES = 2
const SIGNED_OUT_RETRY_MS = 1500
// Firefox makes a content script's own fetch as the extension, without the site's sign-in
// cookies; content.fetch makes it as the page. Chrome and Edge have only the page's fetch.
const pageFetch = globalThis.content?.fetch
  ? globalThis.content.fetch.bind(globalThis.content)
  : globalThis.fetch.bind(globalThis)

const OVERLAY_STYLE = `
  :host { all: initial; }
  [hidden] { display: none !important; }
  .layer {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: rgba(10, 16, 38, 0.55); backdrop-filter: blur(4px);
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    animation: fade-in 0.25s ease-out;
  }
  .layer--toast {
    inset: auto 16px 16px 16px; padding: 0;
    background: none; backdrop-filter: none; pointer-events: none;
  }
  .card {
    box-sizing: border-box; width: min(440px, 100%); padding: 28px;
    display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;
    background: #ffffff; color: #1f284e; border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    animation: rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .layer--toast .card {
    width: min(560px, 100%); padding: 16px 20px;
    flex-direction: row; text-align: left; pointer-events: auto;
  }
  .layer--error .card { border-top: 5px solid #d92d20; }
  .header { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: #5a6b8c; }
  .layer--toast .header { display: none; }
  .logo { width: 24px; height: 24px; }
  .body { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .title { margin: 0; font-size: 19px; font-weight: 700; }
  .layer--toast .title { font-size: 16px; }
  .text, .count { margin: 0; color: #4a5875; }
  .count { font-size: 13px; font-variant-numeric: tabular-nums; }
  .spinner {
    flex: none; width: 44px; height: 44px; box-sizing: border-box; border-radius: 50%;
    border: 4px solid #dbe3f4; border-top-color: #1f6feb; border-right-color: #22b8f0;
    animation: spin 0.9s linear infinite;
  }
  .layer--toast .spinner { width: 30px; height: 30px; border-width: 3px; }
  .bar { position: relative; width: 100%; height: 10px; margin-top: 4px;
    border-radius: 999px; background: #e6ebf5; overflow: hidden; }
  .fill { position: relative; height: 100%; width: 0; border-radius: inherit; overflow: hidden;
    background: linear-gradient(90deg, #1f6feb, #22b8f0); transition: width 0.4s ease; }
  .fill::after { content: ""; position: absolute; inset: 0;
    background-image: linear-gradient(45deg, rgba(255,255,255,0.28) 25%, transparent 25%,
      transparent 50%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.28) 75%, transparent 75%);
    background-size: 20px 20px; animation: stripes 0.8s linear infinite; }
  .bar--indeterminate .fill { position: absolute; width: 35%; animation: slide 1.3s ease-in-out infinite; }
  .badge { flex: none; position: relative; width: 48px; height: 48px; border-radius: 50%;
    animation: pop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.4); }
  .badge--done { background: #12b76a; }
  .badge--done::after { content: ""; position: absolute; left: 17px; top: 10px; width: 11px; height: 21px;
    border: solid #ffffff; border-width: 0 4px 4px 0; transform: rotate(45deg); }
  .badge--error { background: #d92d20; }
  .badge--error::before, .badge--error::after { content: ""; position: absolute; left: 22px; width: 4px;
    background: #ffffff; border-radius: 2px; }
  .badge--error::before { top: 11px; height: 17px; }
  .badge--error::after { top: 32px; height: 4px; }
  .dismiss { margin-top: 6px; padding: 8px 18px; border: 0; border-radius: 8px; cursor: pointer;
    background: #1f284e; color: #ffffff; font: inherit; font-weight: 600; }
  .dismiss:focus-visible { outline: 3px solid #22b8f0; outline-offset: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes stripes { to { background-position: 20px 0; } }
  @keyframes slide { 0% { left: -35%; } 100% { left: 100%; } }
  @keyframes fade-in { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
  @keyframes pop { from { transform: scale(0.4); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
      transition: none !important; }
  }
`

let overlay = null

function getOverlay() {
  if (overlay) return overlay
  const host = document.createElement('div')
  // A closed shadow root keeps the CBA site's styles off the overlay and the overlay's off the site.
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `
    <style>${OVERLAY_STYLE}</style>
    <div class="layer">
      <div class="card" role="status" aria-live="polite">
        <div class="header"><img class="logo" alt=""><span>KU Exchange importer</span></div>
        <div class="spinner"></div>
        <div class="badge"></div>
        <div class="body">
          <h2 class="title"></h2>
          <p class="text"></p>
          <div class="bar"><div class="fill"></div></div>
          <p class="count"></p>
        </div>
        <button class="dismiss" type="button">Dismiss</button>
      </div>
    </div>`
  const element = (selector) => root.querySelector(selector)
  element('.logo').src = api.runtime.getURL('icons/icon-48.png')
  element('.dismiss').addEventListener('click', () => host.remove())
  document.documentElement.append(host)
  overlay = {
    host,
    layer: element('.layer'),
    spinner: element('.spinner'),
    badge: element('.badge'),
    title: element('.title'),
    text: element('.text'),
    bar: element('.bar'),
    fill: element('.fill'),
    count: element('.count'),
    dismiss: element('.dismiss'),
  }
  return overlay
}

// mode is one of: sign-in (a small card that leaves the login page usable), working,
// importing, done or error.
function showOverlay({ mode, title, text, progress = null, count = '' }) {
  const view = getOverlay()
  if (!view.host.isConnected) document.documentElement.append(view.host)
  view.layer.className = `layer${mode === 'sign-in' ? ' layer--toast' : ''}${mode === 'error' ? ' layer--error' : ''}`
  view.spinner.hidden = !['sign-in', 'working', 'importing'].includes(mode)
  view.badge.hidden = !['done', 'error'].includes(mode)
  view.badge.className = `badge badge--${mode}`
  view.title.textContent = title
  view.text.textContent = text
  view.bar.hidden = !['working', 'importing'].includes(mode)
  view.bar.className = progress === null ? 'bar bar--indeterminate' : 'bar'
  view.fill.style.width = progress === null ? '' : `${Math.round(progress * 100)}%`
  view.count.hidden = !count
  view.count.textContent = count
  view.dismiss.hidden = mode !== 'error'
}

function send(message) {
  return api.runtime.sendMessage(message)
}

async function fail(message) {
  showOverlay({
    mode: 'error',
    title: 'The import stopped',
    text: `${message} This tab stays open; start the import again from the KU Exchange portal.`,
  })
  await send({ type: 'failed', message })
}

function readCourseList(doc) {
  return [...doc.querySelectorAll('section')].flatMap((section) => {
    const department = section.querySelector('h2')?.textContent.trim() ?? ''
    return [...section.querySelectorAll(`a[href^="${COURSES_PATH}"]`)].map((link) => {
      const [codeLabel, nameLabel] = link.querySelectorAll('span')
      const href = link.getAttribute('href')
      const match = COURSE_LINK.exec(href)
      return {
        department,
        displayCode: codeLabel?.textContent.trim() ?? '',
        name: nameLabel?.textContent.trim() ?? '',
        code: match ? match[1] + match[2] : null,
        url: new URL(href, location.origin).href,
      }
    })
  })
}

async function fetchFromSite(url, what) {
  for (let attempt = 0; ; attempt += 1) {
    // no-store, so a sign-in redirect the browser saw earlier is never reused.
    const response = await pageFetch(url, { credentials: 'include', cache: 'no-store' })
    if (!new URL(response.url).pathname.startsWith('/accounts/')) {
      if (!response.ok) throw new Error(`Could not open ${what} (HTTP ${response.status}).`)
      return response
    }
    // The CBA site also sends a signed-in account to its sign-in page when that account may
    // not open a page. If the course list still opens, the sign-in is fine and retrying
    // cannot help: the account in use is not allowed to open course pages or syllabi.
    if (await isSignedIn().catch(() => false)) {
      throw new Error(`The KU account signed in to the CBA site can see the course list but is not allowed to open ${what}. Sign out of the CBA site, sign in with a KU account that can open course syllabi, and start again.`)
    }
    if (attempt >= SIGNED_OUT_RETRIES) throw new Error('Your CBA sign-in ended during the import.')
    await new Promise((resolve) => setTimeout(resolve, SIGNED_OUT_RETRY_MS))
  }
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// A course page has no ids or labels to select by; each section is an <h2> heading followed
// by its content, so the heading's text is what identifies the section.
function readSection(doc, heading) {
  const title = [...doc.querySelectorAll('h2')]
    .find((element) => element.textContent.trim().toLowerCase() === heading)
  return title?.nextElementSibling ?? null
}

async function readSyllabus(course, doc) {
  const download = doc.querySelector('a[href*="/syllabus/download/"]')
  if (!download) return null

  const response = await fetchFromSite(
    new URL(download.getAttribute('href'), location.origin).href,
    `the syllabus for ${course.displayCode}`,
  )
  const blob = await response.blob()
  return {
    type: (response.headers.get('content-type') ?? '').split(';')[0].trim(),
    data: await toBase64(blob),
  }
}

async function readCoursePage(course) {
  const page = await fetchFromSite(course.url, `the CBA page for ${course.displayCode}`)
  const doc = new DOMParser().parseFromString(await page.text(), 'text/html')
  const clos = [...(readSection(doc, 'what you will be able to do')?.querySelectorAll('li') ?? [])]
    .map((item) => item.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return {
    description: readSection(doc, 'course description')?.textContent.trim() || null,
    clos: clos.length > 0 ? clos : null,
    file: await readSyllabus(course, doc),
  }
}

function showImportProgress(saved, total, lastSaved) {
  showOverlay({
    mode: 'importing',
    title: 'Importing CBA subjects',
    text: 'Keep this tab open. It closes by itself when every subject is saved.',
    progress: saved / total,
    count: `${saved} of ${total} saved${lastSaved ? ` · ${lastSaved}` : ''}`,
  })
}

async function runImport() {
  showOverlay({ mode: 'working', title: 'Reading the course list', text: 'Finding every CBA subject on this page.' })

  const listed = readCourseList(document)
  const courses = listed.filter((course) => course.code && course.department && course.displayCode && course.name)
  // The CBA list has a few entries whose link is not a 4-digit/3-digit course number;
  // they cannot form a valid course code, so they are reported instead of saved.
  const skipped = listed.filter((course) => !courses.includes(course)).map((course) => course.displayCode || course.url)
  if (courses.length === 0) {
    await fail('No courses were found on the CBA syllabus page.')
    return
  }

  showImportProgress(0, courses.length, '')
  await send({ type: 'status', state: 'importing', message: `Found ${courses.length} subjects on the CBA site.`, total: courses.length })

  let nextIndex = 0
  let saved = 0
  let failure = null
  async function importNextCourses() {
    while (!failure && nextIndex < courses.length) {
      const course = courses[nextIndex++]
      try {
        const { description, clos, file } = await readCoursePage(course)
        const reply = await send({
          type: 'subject',
          subject: {
            course_code: course.code,
            course_display_code: course.displayCode,
            course_name: course.name,
            course_department: course.department,
            course_description: description,
            course_clos: clos,
          },
          file,
        })
        if (!reply?.ok) throw new Error(reply?.error || `The portal could not save ${course.displayCode}.`)
        saved += 1
        if (!failure) showImportProgress(saved, courses.length, course.displayCode)
      } catch (error) {
        failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_COURSES }, importNextCourses))

  if (failure) {
    await fail(failure.message)
    return
  }
  showOverlay({ mode: 'done', title: 'All subjects saved', text: `${saved} subjects are in KU Exchange. This tab closes now.` })
  const reply = await send({ type: 'finished', saved, skipped })
  if (!reply?.ok) await fail(reply?.error || 'The portal could not confirm the import.')
}

async function isSignedIn() {
  const response = await pageFetch(new URL(COURSES_PATH, location.origin).href, { credentials: 'include', cache: 'no-store' })
  return response.ok && !new URL(response.url).pathname.startsWith('/accounts/')
}

function waitForSignIn() {
  showOverlay({
    mode: 'sign-in',
    title: 'Waiting for you to sign in',
    text: 'Click Continue and sign in with your KU Microsoft account. The import starts by itself.',
  })
  send({ type: 'status', state: 'signing-in', message: 'Waiting for you to sign in with your KU Microsoft account in the CBA tab.' })
    .catch(() => {})

  let isChecking = false
  let timer = null
  async function checkSignIn() {
    if (isChecking) return
    isChecking = true
    try {
      if (await isSignedIn()) {
        clearInterval(timer)
        showOverlay({ mode: 'working', title: 'Signed in', text: 'Opening the CBA course list.' })
        location.assign(COURSES_PATH)
      }
    } catch {
      // A failed check only means "not yet"; the next one tries again.
    } finally {
      isChecking = false
    }
  }
  timer = setInterval(checkSignIn, SIGN_IN_CHECK_MS)
  window.addEventListener('focus', checkSignIn)
  window.addEventListener('pageshow', checkSignIn)
  document.addEventListener('visibilitychange', checkSignIn)
  checkSignIn()
}

async function routeImportTab() {
  const path = location.pathname
  if (path === COURSES_PATH) {
    await runImport()
  } else if (path === LOGIN_PATH) {
    waitForSignIn()
  } else if (path.startsWith('/accounts/')) {
    await fail('Signing in to the CBA site did not complete.')
  } else {
    // After sign-in the site can land on another page; the course list is where the import runs.
    showOverlay({ mode: 'working', title: 'Signed in', text: 'Opening the CBA course list.' })
    location.assign(COURSES_PATH)
  }
}

// The tab starts in one of two ways, whichever comes first: it keeps asking the background,
// or the background tells it when the page finishes loading. After the Microsoft sign-in the
// background has usually been stopped for being idle, and a single question or a single
// push could both be missed, leaving the import waiting until the user clicked the page.
let hasStarted = false
let hasAnswer = false

function startImportTab() {
  if (hasStarted) return
  hasStarted = true
  routeImportTab().catch((error) => fail(error.message))
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'run-import-tab') return false
  startImportTab()
  sendResponse({ ok: true })
  return false
})

let importTabChecks = 0
const importTabTimer = setInterval(askIfImportTab, IMPORT_TAB_CHECK_MS)

function askIfImportTab() {
  importTabChecks += 1
  if (hasAnswer || hasStarted || !api.runtime?.id || importTabChecks > IMPORT_TAB_CHECK_ATTEMPTS) {
    clearInterval(importTabTimer)
    return
  }
  send({ type: 'is-import-tab' })
    .then((reply) => {
      hasAnswer = true
      if (reply?.importing) startImportTab()
    })
    .catch(() => {})
}

askIfImportTab()
