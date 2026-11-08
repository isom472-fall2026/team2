# KU Exchange CBA Syllabus Importer

A browser extension for KU coordinators (issue #146). It opens the CBA syllabus site
(`cmu-cba.ku.edu.kw`), waits while you sign in with your KU Microsoft account, then reads
every CBA subject and downloads its syllabus. The KU Exchange portal saves each one to the
`subjects` table and the `syllabi` storage bucket with your own portal login. The extension
holds no keys or passwords.

## Install

The extension is not published to a store. Load it from this folder.

**Chrome or Edge**

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension` folder.

**Firefox (140 or later)**

Firefox needs a different background setting from Chrome and Edge, so it loads a copy of
this folder built with its own manifest (the Firefox-only keys are in
`manifest.firefox.json`).

1. In the repository folder, run `npm run build:firefox-extension`. This writes the copy to
   `extension-firefox/`. Run it again after any change to the extension.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose `extension-firefox/manifest.json`.
4. Open `about:addons`, select the importer, open **Permissions**, and allow access to
   `cmu-cba.ku.edu.kw` and the KU Exchange site if they are switched off.

Firefox removes a temporary add-on when it closes, so load it again next time.

## Use

1. Sign in to the KU Exchange portal as a KU coordinator and open **CBA subjects**.
2. Click **Import subjects from the CBA site**. A new tab opens on the CBA site.
3. In that tab, click **Continue** and sign in with your KU Microsoft account.
4. The import starts by itself. The portal shows how many subjects are saved.
5. When every subject is saved, the CBA tab closes and the portal lists the subjects.

If sign-in, reading the site or saving fails, the portal shows the error and the CBA tab
stays open with a red banner.

## Sites it runs on

- `https://isom472-fall2026.github.io/team2/` and `http://localhost` — relays messages
  between the portal and the extension.
- `https://cmu-cba.ku.edu.kw/` — reads the course list and syllabi, only in the tab the
  import opened.
