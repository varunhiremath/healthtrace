# Architecture — HealthTrace

The codebase map. Check here before grepping.

## Shape

Offline-first React SPA. All state is either in IndexedDB (health data, via Dexie) or
localStorage (preferences, via Zustand). There is no network layer at all — the only outbound
requests the app makes are for the Google Fonts stylesheet, and it renders fine without it.

```
main.jsx  → opens HealthTraceDB, then mounts RouterProvider (or DbRecovery if the DB won't open)
router.jsx → AppLayout (bottom nav + toasts + onboarding) wrapping the pages
hooks/useHealth.js → the single read path: Dexie live queries → derived values → ready-to-render rows
db/actions.js → the single write path
```

## Routes

| Path | Page | What |
| --- | --- | --- |
| `/` | `LoadingPage` | Redirects to `/home` |
| `/home` | `HomePage` | Snapshot ring, insights, pinned markers, what needs a look |
| `/log` | `LogPage` | Fast entry for home-measured vitals |
| `/reports` | `ReportsPage` | Every checkup, newest first |
| `/reports/new` | `ReportEditorPage` | New report (declared before `:id` so "new" isn't read as an id) |
| `/reports/:id` | `ReportDetailPage` | One panel, grouped by category, plus calculated markers |
| `/reports/:id/edit` | `ReportEditorPage` | Same form as new |
| `/trends` | `TrendsPage` | Marker browser, searchable, grouped by category |
| `/markers/:key` | `MarkerDetailPage` | Chart, stats, history, unit switch, target |
| `/more` | `MorePage` | Profile, settings, export, import, erase |
| `/profiles` | `ProfilesPage` | The household: everyone, their record counts, who is being viewed |
| `/profiles/new` | `ProfilePage` | Add a family member (declared before `:id`) |
| `/profiles/:id` | `ProfilePage` | Edit or delete one person |
| `/settings` | `SettingsPage` | Theme, motion, sound, date format, reminder, pins |
| `/import` | `ImportPage` | Restore a JSON backup or load a CSV |
| `*` | → `/home` | Never a blank screen |

## Database — `HealthTraceDB` (Dexie), schema v2

Never rename the database. Migrations are append-only `db.version(n)` blocks.

| Table | Indexes | Notes |
| --- | --- | --- |
| `profile` | `++id, name, createdAt` | One row per family member. name, relation, dob, sex, heightCm, color |
| `reports` | `++id, profileId, date, createdAt, [profileId+date]` | A checkup. title, lab, doctor, note unindexed |
| `readings` | `++id, profileId, markerKey, date, reportId, [profileId+markerKey]` | The data. value, note unindexed |
| `targets` | `++id, profileId, markerKey, [profileId+markerKey]` | Doctor-set min/max, per person |
| `attachments` | `++id, reportId` | Original PDF/photo Blob, written from the report editor. Excluded from JSON backups |

`reportId` is `null` for a reading logged on its own from `/log`. `profileId` is never null — every
report, reading and target belongs to exactly one person.

**v1 → v2** turned the single `profile` row into a table of people and stamped `profileId` onto every
existing report, reading and target, handing them all to the profile that was already there. The old
`[markerKey+date]` index was never queried and was dropped; `targets.markerKey` lost its unique
constraint, since two people may each set a target for the same marker.

## localStorage

| Key | Contents |
| --- | --- |
| `healthtrace_prefs` | onboarded, theme, effects, sound, units, **activeProfileId**, **pinnedByProfile**, dayFirstDates, checkupReminder, checkupIntervalDays, lastRemindedDate |

`activeProfileId` is a hint, not a guarantee: `useProfile()` falls back to the first profile when it
points at somebody deleted. Pins are per person (`pinnedByProfile`); units are a preference of the
person *using* the app, so they stay global.

## Data

| File | What |
| --- | --- |
| `data/markers.js` | **The catalogue.** 74 markers: key, name, category, unit, altUnit + factor, decimals, `bands`, optional `bandsBySex`, `scale`, `direction`, `aliases` (for the parser), `derived`, `vital`, `about` |
| `data/categories.js` | The nine categories, in display order |

**Band contract:** ascending by `upTo`, which is the LAST value still in that band; the final band
is `upTo: null`. A boundary on a marker that displays decimals must sit one display step below the
clinical cut-off.

## Utils (pure, each with a co-located `*.test.js`)

| File | Exports |
| --- | --- |
| `ranges.js` | `classify`, `bandsFor`, `optimalRange`, `formatRange`, `formatValue`, `scalePosition`, `bandSegments`, `trendDirection`, `statusMeta`, `severity`, `isOutOfRange`, `step`, `isValidTarget`, `effectiveMarker` |
| `units.js` | `toAlt`, `fromAlt`, `toDisplay`, `fromDisplay`, `displayUnit`, `hasAltUnit`, `normaliseUnit`, `convertReported`, `kgToLb`, `lbToKg`, `cmToIn`, `inToCm`, `cmToFtIn`, `ftInToCm` |
| `derived.js` | `bmi`, `nonHdl`, `cholRatio`, `ldlFriedewald`, `eag`, `homaIr`, `map`, `egfr`, `computeDerived`, `DERIVED_SOURCES` |
| `pdfText.js` | `linesFromTextItems` (pure — rebuilds table rows from positioned PDF fragments), `extractPdfText` (lazy-loads pdfjs), `describePdfLimit` |
| `shareText.js` | `buildMarkerShare`, `buildSnapshotShare`, `pickShareStrategy` — the words a shared card says, and which share path a device supports |
| `shareCard.js` | `drawMarkerCard`, `canvasToPngFile` — canvas layout only, no words (browser-only) |
| `parseReport.js` | `parseReport`, `parseReportDate`, `parseReportName`, `matchProfileByName`, `normaliseText` — handles both the same-line layout and the two-column Epic/MyChart layout where values land on a later line, and reads the patient name out of a header so a pasted report files itself under the right person |
| `trends.js` | `seriesFor`, `latest`, `previous`, `stats`, `delta`, `slopePerMonth`, `movingAverage`, `summarise`, `derivedSeries`, `rankByConcern`, `RANGES` |
| `insights.js` | `buildInsights`, `headline`, `inRangeScore`, `reportSummary`, `sideOfRange`, `CHECKUP_INTERVAL_DAYS` |
| `dates.js` | `toDateKey`, `todayKey`, `fromDateKey`, `isDateKey`, `daysBetween`, `monthsBetween`, `daysAgo`, `addDays`, `ageAt`, `formatDate`, `formatMonth`, `relativeDate`, `yearBands` (the calendar years a time span touches, clamped to it — what the trend chart stripes by) |
| `pager.js` | `pagerOrder`, `pagerNeighbours`, `swipeDirection`, `SWIPE` — the order markers are paged through (the Trends order) and whether a touch was a flick rather than a scroll or a chart drag |
| `backup.js` | `buildBackup`, `validateBackup`, `backupFilename`, `BACKUP_VERSION` (2), `BACKUP_KIND`. v2 carries the household; v1 files are lifted into the same shape on import |
| `csv.js` | `toCsv`, `fromCsv`, `parseCsv`, `escapeCsv`, `CSV_HEADERS` |
| `theme.js` | `resolveTheme`, `applyTheme` (not node-tested — touches `document`) |
| `sound.js` | `playCue` (WebAudio, no samples) |

## Hooks

| Hook | Returns |
| --- | --- |
| `useHealthData()` | The whole picture **for the active person**: `rows`, `rowByKey`, `pinnedRows`, `pinnedMissing`, `concerns`, `derivedByDate`, `reports`, `readings`, `targets`, `profile`, `profiles`, `profileId`, `pinned`, `sex`, `loading` |
| `useProfiles()` | Everyone in the household, oldest first |
| `useMarkerHistory(key)` | One marker: `marker` (target applied), `base`, `series`, `latest`, `delta`, `status` |
| `useReportReadings(id)` | One report's readings, decorated with status and grouped by category |
| `useProfile()` | The active person, with a fallback to the first profile |
| `useReports(profileId)` / `useReadings(profileId)` / `useTargets(profileId)` / `useAttachments(id)` | Raw live queries, profile-scoped |
| `useHaptics()` | `fire(kind)` — gated on `effects` |
| `useSwipeNav({onLeft,onRight,enabled})` | Touch handlers to spread onto an element, plus left/right arrow keys. Never calls `preventDefault`, so vertical scrolling is untouched |

`components/health/EdgePager.jsx` is the visible half of that gesture: a 24px sliver at each screen
edge naming the next and previous marker. It portals to `document.body` for the same reason modals
do — the page root's entrance animation leaves a `transform` behind, which would otherwise make it
the containing block for `position: fixed`. It is pinned to the summary card by a fixed pixel offset, not a
percentage, so it clears the chart on every screen height, and it hides and pops on a 5s cycle with the
chevron nudging on its own 1.3s loop (both gated by `settingsStore.effects` and
`prefers-reduced-motion`). Solid `--color-pulse` with white type — the quiet card treatment it
started with was unreadable against the near-white page.

`loading` is true until Dexie has actually answered, so a screen never renders "empty" over data
that is still arriving.

## Stores

- `settingsStore` — preferences, persisted to localStorage on every setter.
- `uiStore` — toasts, plus promise-returning `confirm()` and `prompt()`.

## Components

| Path | What |
| --- | --- |
| `layout/AppLayout` | Safe-area padding, `<Outlet/>`, bottom nav, onboarding, toast host |
| `layout/BottomNav` | The five tabs; Add is the filled centre one |
| `layout/TopBar` | Title, subtitle, optional back and right slots |
| `ui/Modal` | Bottom sheet, portalled, 90vh cap, scrolls inside |
| `ui/UiHost` | Toasts + confirm + prompt dialogs |
| `ui/Field` | `Field`, `Input`, `Select`, `Button` — every form uses these |
| `ui/EmptyState` | Icon, title, body, action |
| `health/StatusPill` | The only place a status becomes a colour chip |
| `health/RangeBar` | Reference bands with the reading marked on them |
| `health/Sparkline` | Inline SVG history |
| `health/MarkerRow` | One marker line, used on Home, Trends and in reports |
| `health/DeltaBadge` | Change since last, coloured by direction of health, not of the arrow |
| `charts/TrendChart` | Recharts line with the healthy band shaded and per-point statuses |
| `profile/Avatar` | A person as a coloured circle of initials |
| `profile/ProfileSwitcher` | The chip on Home, and the sheet that changes person |
| `home/SnapshotRing` | The in-range ring |
| `home/InsightCard` | One plain-English note |
| `log/MarkerPicker` | Search across names, short labels and parser aliases |
| `reports/PasteImport` | Open a PDF or paste text; shows what was read, whose it is, and every hit before saving |
| `share/ShareSheet` | Card preview, name toggle, and the Web Share / copy / download paths |
| `onboarding/Onboarding` | Three slides then an optional profile |
| `fx/CountUp` | Animated number, gated on effects and reduced-motion |
| `ErrorBoundary` / `DbRecovery` | Crash screen and "IndexedDB won't open" screen |

## Build

- **pdfjs is lazy and un-precached.** `pdfText.js` dynamic-imports `pdfjs-dist/legacy/build/pdf.js`
  (the 3.x legacy build — newer majors emit top-level await, which the browser target and older
  Android WebViews cannot parse). The engine and its worker are ~1.5 MB, so `globIgnores` keeps them
  out of the service-worker precache and a `CacheFirst` runtime rule stores them the first time
  someone opens a PDF. The app therefore installs light and reads PDFs offline after first use.
- Pages build: base `/healthtrace/`. Capacitor build: `CAPACITOR_BUILD=true`, base `/`.
- `router.jsx` derives its basename from `import.meta.env.BASE_URL`, so both work unchanged.
- The service worker uses `cleanupOutdatedCaches`, `clientsClaim`, `skipWaiting`, so a deploy never
  strands a client on a stale `index.html`.
