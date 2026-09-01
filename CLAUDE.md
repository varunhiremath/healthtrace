# CLAUDE.md — HealthTrace project memory

> **HealthTrace** is a **free, offline-first family health-metrics PWA** — blood work, vitals,
> trends, one profile per family member. React 18 + Vite + Tailwind v3 · Dexie/IndexedDB · Zustand · React Router · Recharts ·
> vite-plugin-pwa · Capacitor (APK only). 100% local, no backend, no account, no sync.
>
> Repo + Vite `base` are `healthtrace` / `/healthtrace/`. The Dexie database is `HealthTraceDB` —
> **never rename it**, that orphans every existing user's health history.

## Start here
- **`docs/ARCHITECTURE.md`** — the codebase map: routes, DB tables, localStorage keys, every
  util/hook/store/component. Check it before grepping.
- **`docs/GUIDELINES.md`** — engineering rules and the health-data rules. Follow these.
- **`docs/STATE.md`** — live status and the reverse-chronological build log.

Update `docs/STATE.md` at the end of every piece of work, and `docs/ARCHITECTURE.md` whenever you
add a table, store field, util, hook, route, or localStorage key.

## The rules that matter most

1. **`src/data/markers.js` is the source of truth** for what can be tracked, in what unit, and what
   counts as healthy. Never rename a marker `key` — readings reference it.
2. **Band boundaries are the last value still IN the band.** A marker that displays decimals needs
   its boundary one display step below the clinical cut-off, or its range reads as "29.1 – 100.0"
   instead of "30.0 – 100.0". `src/utils/ranges.test.js` locks the printed range of every marker;
   if you touch a band, that test tells you what you actually did.
3. **Store the canonical unit, convert at display.** Every reading is stored in its marker's `unit`.
   `utils/units.js` converts for entry and display. A user switching to mmol/L must never rewrite
   history.
4. **Derived markers are computed, never stored.** BMI, eGFR, non-HDL, cholRatio, eAG, HOMA-IR are
   worked out at read time in `utils/derived.js`. This is what makes deletes clean — there is no
   derived row to reconcile.
5. **Deletes leave nothing behind.** Deleting a report deletes its readings and attachment in one
   Dexie transaction; deleting a person deletes their reports, readings, targets and attachments the
   same way (`db/actions.js`). Anything addable must be editable and deletable.
5b. **Every owned row carries `profileId`.** Reports, readings and targets all belong to exactly one
   person. Nothing writes an unowned row — a reading belonging to nobody appears in nobody's history
   and cannot be found again. The report owns its readings, so `replaceReportReadings` takes the
   person from the report rather than from an argument that could disagree.
6. **Pure logic goes in `src/utils/*.js` with a co-located `*.test.js`.** UI and DB code is not
   node-tested; it is verified by running the app.
7. **Never invent a health claim.** `utils/insights.js` may only restate a number, compare it to a
   published range, or describe a change over time. No diagnosis, no prediction, no advice. An
   empty insight list is a valid result.
8. **Say what the app cannot do.** No backend means no background notifications and no backup; no
   OCR means a photo of a report cannot be read. The UI states each of these plainly rather than
   implying otherwise.
8b. **Sharing is the one outward path.** `components/share/` sends data off the device, so it is
   always explicit, always per-item, previewed before it goes, and the name is opt-in. Never add a
   bulk or background share.
9. **Modals portal to `document.body`**, cap at 90vh, and scroll inside (`components/ui/Modal.jsx`).
10. **Migrations are append-only** `db.version(n)` blocks in `src/db/db.js`. Index only what is
    queried.

## Wow, but calm
This is a health app, so liveliness is subtle: the Home ring draws itself, values count up, the
range-bar marker slides into place, charts animate once. All gated behind `settingsStore.effects` /
`sound` and `prefers-reduced-motion`. No confetti, no streak rewards, no gamification of illness.

## Design
`src/styles/tokens.css` is the single source of truth; `tailwind.config.js` mirrors it. The five
status colours (optimal / borderline / low / high / critical) are semantic and only
`utils/ranges.js` decides which applies — no component may invent its own verdict colour.
Both light and dark themes are defined; anything on an accent background uses white text.

## Verifying
- `npm test` — the pure logic (311 tests).
- `npm run build` — must stay clean.
- Heavy, rarely-used dependencies (pdfjs) are lazy-imported and kept OUT of the service-worker
  precache, so the PWA installs light and caches them on first use.
- Run the real app to check UI changes: `npm run build && npx vite preview`, then drive it with
  Playwright (`executablePath: '/opt/pw-browsers/chromium'` in this sandbox). Screenshots caught
  every UI bug found so far — a passing unit test did not.

## Workflow
- **Push straight to `main`** — standing instruction from the user (2026-09-01). Work on the
  feature branch, then fast-forward `main` onto it and push both. No PR unless asked. `main` is
  what deploys, so anything not on it does not exist as far as the user's phone is concerned.
- Every push to `main` is a release: verify before pushing, not after.
- CI (`.github/workflows/deploy.yml`) runs vitest + a production build on every PR, then deploys
  Pages from `main`. `android-apk.yml` publishes a sideloadable APK to Releases on every push to
  `main`; the `android/` project is generated in CI and is not committed.
- Commits: author `Claude <noreply@anthropic.com>` so GitHub shows them verified. **Never** put the
  model identifier in any committed artifact.
