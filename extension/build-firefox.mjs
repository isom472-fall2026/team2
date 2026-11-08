// Chrome and Edge warn about background.scripts in Manifest V3, and Firefox has no
// extension service workers, so one manifest cannot serve both. manifest.json is the
// Chrome and Edge one; this builds the Firefox copy by replacing its keys with the ones in
// manifest.firefox.json.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = dirname(fileURLToPath(import.meta.url))
const target = join(source, '..', 'extension-firefox')
const notCopied = new Set(['build-firefox.mjs', 'manifest.firefox.json', 'store-assets'])

const readJson = (name) => JSON.parse(readFileSync(join(source, name), 'utf8'))
const manifest = { ...readJson('manifest.json'), ...readJson('manifest.firefox.json') }

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true, filter: (path) => !notCopied.has(basename(path)) })
writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Firefox extension written to ${target}`)
