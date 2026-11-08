# Privacy statement — KU Exchange CBA Syllabus Importer

Last updated: 7 November 2026

The KU Exchange CBA Syllabus Importer is a browser extension for Kuwait University
exchange coordinators. It copies CBA subjects and their syllabi from the CBA syllabus site
into the KU Exchange coordinator portal. This statement explains what it touches and what
it does not.

## What the extension reads

- **On `cmu-cba.ku.edu.kw`**, only in the tab the extension opened for an import, it reads
  the public course list (course code, course name, department), reads each course's
  description and learning outcomes, and downloads each course's syllabus file. It runs nowhere else on that site and does nothing in tabs you
  opened yourself.
- **On the KU Exchange portal** (`isom472-fall2026.github.io/team2`), it passes messages
  between the portal page and the extension, so the portal can start an import and
  receive the subjects.

## Where that data goes

The subjects and syllabus files go to one place only: the KU Exchange portal tab that
started the import. The portal then saves them to the KU Exchange database using the
coordinator's own portal login.

The extension itself:

- does not send any data to its developers or to any third party;
- has no analytics, tracking, advertising or remote code;
- does not read, store or send your Microsoft password or sign-in details. You sign in on
  Microsoft's own pages, where the extension does not run;
- does not read your browsing history, other tabs or other websites.

## What the extension stores

While an import runs, it keeps two tab numbers (the portal tab and the CBA tab) in the
browser's session storage so the import can continue if the browser pauses the extension.
It deletes them when the import finishes or fails, and the browser clears them when it
closes. Nothing else is stored.

## Permissions

- **storage** — the two tab numbers described above.
- **Access to `cmu-cba.ku.edu.kw`** — to read the course list and download syllabi during an
  import.
- **Access to the KU Exchange portal** (and `localhost` for the team's development copy) —
  to pass messages between the portal page and the extension.

## Contact

Questions about this extension can be raised as an issue in the project repository:
<https://github.com/isom472-fall2026/team2/issues>.
