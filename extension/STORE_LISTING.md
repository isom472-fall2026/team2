# Store listing — KU Exchange CBA Syllabus Importer

Text to paste into the Chrome Web Store, Microsoft Edge Add-ons and addons.mozilla.org
(AMO) forms. A team member submits it. For Chrome and Edge the extension package is the
`extension/` folder zipped with `manifest.json` at the top level (leave out this file,
`README.md`, `PRIVACY.md`, the `.ico` files, `build-firefox.mjs`, `manifest.firefox.json`
and the `store-assets` folder). For AMO, run `npm run build:firefox-extension` and zip
`extension-firefox/` the same way.

## Name

KU Exchange CBA Syllabus Importer

## Short description (132 characters or fewer)

For KU Exchange coordinators: imports CBA subjects and their syllabi from the CBA syllabus site into the KU Exchange portal.

## Full description

The KU Exchange CBA Syllabus Importer helps Kuwait University exchange coordinators keep
the KU Exchange portal's subject list up to date with the College of Business
Administration (CBA).

How it works:

1. In the KU Exchange coordinator portal, open "CBA subjects" and click "Import subjects
   from the CBA site".
2. The extension opens the CBA syllabus site in a new tab and waits while you sign in with
   your KU Microsoft account.
3. Once you are signed in, it reads every CBA subject and downloads its current syllabus,
   showing a progress bar as it goes.
4. The portal saves each subject and syllabus, then the CBA tab closes by itself.

If sign-in, reading or saving fails, the portal shows the error and the CBA tab stays open
so you can see what happened.

The extension only works together with the KU Exchange portal and is intended for KU
exchange coordinators who have access to the CBA syllabus site. It collects no personal
data, has no analytics and sends nothing to its developers.

## Category

- Chrome Web Store / Edge: Productivity → Workflow & planning tools
- AMO: Other

## Privacy policy URL

<https://github.com/isom472-fall2026/team2/blob/main/extension/PRIVACY.md>

## Single purpose (Chrome Web Store)

Import CBA subjects and their syllabi from the CBA syllabus site into the KU Exchange
coordinator portal.

## Permission justifications (Chrome Web Store)

- **storage:** Remembers which tab started the import and which tab is reading the CBA site,
  so the import can continue if the browser pauses the extension's background script.
  Cleared when the import ends.
- **Host access to `https://cmu-cba.ku.edu.kw/*`:** Reads the CBA course list and downloads
  each course's syllabus, only in the tab the extension opened for the import.
- **Host access to `https://isom472-fall2026.github.io/team2/*`, `http://localhost/*` and
  `http://127.0.0.1/*`:** Passes messages between the KU Exchange portal page and the
  extension. The two local addresses are the team's development copy of the portal; drop
  them from the store package if a reviewer asks.
- **Remote code:** None. All code ships in the package.

## Data usage (Chrome Web Store form)

- Data collected: **Website content.** The CBA course list and syllabus files are passed to
  the KU Exchange portal that started the import. No personally identifiable information,
  health, financial, authentication, personal communications, location, web history or
  user activity data is collected.
- Certify: not sold to third parties; not used or transferred for purposes unrelated to
  the single purpose; not used for creditworthiness or lending.

## Data collection (Firefox)

The manifest declares `data_collection_permissions: { "required": ["none"] }`. The
extension handles course information and syllabus files, not personal data, and sends
nothing to its developers or third parties.

## Images (in `store-assets/`)

Upload in this order. They were drawn from the portal's own CSS and the extension's own
overlay code; the course rows are real CBA courses, and no real person's name or ID appears.

| File | Size | Store field |
|---|---|---|
| `screenshot-1-subjects-imported.png` | 1280×800 | Screenshot 1: the portal's subject list after an import |
| `screenshot-2-waiting-for-sign-in.png` | 1280×800 | Screenshot 2: the CBA tab waiting for Microsoft sign-in |
| `screenshot-3-importing-on-cba-site.png` | 1280×800 | Screenshot 3: the CBA tab importing, with the progress bar |
| `screenshot-4-portal-loading-screen.png` | 1280×800 | Screenshot 4: the portal's loading screen during an import |
| `promo-tile-440x280.png` | 440×280 | Small promo tile |
| `../icons/icon-128.png` | 128×128 | Store icon |
