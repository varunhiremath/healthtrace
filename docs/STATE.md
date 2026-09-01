# STATE — HealthTrace

## Status

**v1.2.0** — PDFs in, cards out. Reports load straight from a PDF, and any reading can be shared. 245 vitest tests green, production build clean,
and the whole flow driven end to end in a real browser.

### What is built

- 73 markers across nine categories, with reference bands, sex-specific ranges where they genuinely
  differ, alternate units, and report aliases.
- Home: in-range ring, plain-English insights, pinned markers, "worth a look".
- Log: fast vital entry that grades what you type as you type it.
- Reports: list, detail grouped by panel, full editor, and the paste-a-lab-report importer.
- Trends: searchable marker browser; per-marker chart with the healthy band shaded, 3M/1Y/3Y/All,
  stats and long-run drift, full reading history with delete.
- Derived markers computed at read time: BMI, eGFR (CKD-EPI 2021), non-HDL, total:HDL, eAG, HOMA-IR.
- Doctor-set targets that override the population range everywhere.
- Export (JSON + CSV), validating import (merge or replace), erase-all.
- Profile, settings (theme, motion, sound, date format, checkup reminder, pins), onboarding.
- PWA (installable, offline) + a CI-built sideloadable Android APK.

### Deliberately not done

- **Data does not live in a git repo.** Considered and rejected with the user: the app repo deploys
  to GitHub Pages, and on a personal account a Pages site is public even when its repo is private,
  so anything committed there would be served at a guessable URL. Syncing to a *second* private repo
  with a personal access token was the alternative; the user chose to keep everything local and move
  it by exported file, which is also the only option that keeps the app's "never leaves this device"
  promise literally true.

### Not built yet

- **Attachments can be added but not previewed.** The report editor writes and deletes them; the
  report detail screen does not yet show or open one. Next obvious step.
- **No OCR.** A photo of a report is attached, not read. Deliberate: on a lab table, where meaning
  lives in column alignment, OCR misreads often enough to be unsafe, and the engines are multi-MB.
- The checkup reminder is an in-app note only. A PWA with no backend cannot reliably wake itself;
  the UI says so. A Capacitor local-notification path could change that for the APK build.
- No multi-person profiles.

---

## Build log

### 2026-09-01 — v1.2.0, PDFs in and cards out

**PDF import.** `pdfText.js` extracts a PDF's text and — the part that matters — rebuilds it into
LINES. A PDF has no rows, only positioned fragments; the parser depends entirely on a marker name
and its value sharing a row, so fragments are grouped by baseline (±3 units) and ordered by x before
the parser ever sees them. The result is dropped into the same visible textarea as a paste, so you
can see and correct exactly what was read. Measured against the real corpus: **4, 32 and 39 markers
from a 2-page, a 7-page and a 10-page report**, matching an independent offline extraction of the
same files.

Two engineering notes worth keeping:
- pdfjs is pinned to the **3.x legacy build**. Both the modern and legacy 4.x builds emit top-level
  await, which the browser target — and an older Android WebView — cannot parse; the build failed
  outright until this was pinned.
- The engine and worker are ~1.5 MB. They are lazy-imported AND excluded from the service-worker
  precache (`globIgnores`), with a `CacheFirst` runtime rule instead. Precaching them would have
  more than doubled the install for a feature most sessions never touch.

A scanned PDF has no text layer, and the app says so specifically ("it is a scan or photo of a page
rather than a digital report") instead of reporting zero markers as though parsing had failed.

**Sharing.** Any reading renders to a canvas card — value, verdict, reference range, delta, trend —
and goes out through the Web Share API, falling back to text-share, clipboard, then download
depending on what the browser supports. Sharing is the one place this app sends health data outward,
so: explicit, per-item, previewed before it goes, name off by default, and a plain note that the app
cannot take it back. Drawn on a raw 2D canvas rather than with a screenshot library — no dependency,
identical on every device, and structurally incapable of capturing anything not passed to it.

**Bugs the browser caught, none of which a unit test would have:**
1. The PDF never loaded, silently. Two file inputs on the same screen matched the same selector, so
   the file went to the attachment picker instead of the reader. Both inputs now carry distinct
   aria-labels — better for screen readers, and the reason the test could target the right one.
2. The share card's status spine was drawn as a 14px-wide rounded rect with a 40px radius, which
   folds in on itself and left an artifact at the corner. Now clipped to the card instead.
3. The value's digits climbed into the marker title: the line advance was smaller than the 132px
   font's cap height.
4. The trend line silently disappeared. Padding was subtracted twice in the height calculation,
   leaving 38px, and `drawTrend` bails below its minimum. Geometry now derives from the footer's
   actual baseline.

Tests 283 → 311; the new ones cover row reconstruction from PDF fragments and what a shared card
says, including that the name stays off unless asked for.

### 2026-09-01 — v1.1.0, family profiles

The app now keeps records for a household rather than one person.

**Data model.** DB v2 turns the single `profile` row into a table of people and stamps `profileId`
onto every report, reading and target. The upgrade hands all existing data to the profile already
there, so an install from v1 opens on exactly the history it had. `targets.markerKey` loses its
unique constraint (two people may each target the same marker) and the never-queried
`[markerKey+date]` index is replaced by `[profileId+markerKey]`, which every trend query uses.

**The invariant that matters:** every owned row carries a `profileId`, and nothing writes one
without it. `replaceReportReadings` takes the person from the report rather than an argument, so the
two can never disagree; `updateReport` carries a changed owner down to the readings; deleting a
person removes their reports, readings, targets and attachments in one transaction. The browser test
asserts zero unowned rows rather than trusting the code.

**Backups.** Format v2 carries the whole household in one file — people, reports, readings and
targets. v1 files still import: they are lifted into the v2 shape and their rows given to the single
person they described. That mattered concretely, because a v1 backup had already been handed to the
user; the browser test imports that exact file and checks every reading lands.

**Filing a report under the right person.** `parseReportName` reads the patient name out of a report
header — four header styles across the test corpus, every one of them read correctly — and
`matchProfileByName` maps it to a family member, returning null rather than guessing when a name
fits two people equally. The paste screen shows whose report it read, loudly when that is not the
person on screen, and the report editor carries an explicit person picker. Nothing is re-filed
silently.

**A bug the real data exposed:** an HDL just under its optimal window was announced as "HDL
Cholesterol is above range" when it sits *below* that window. The phrasing was derived from the
status name, but
'borderline' means below the window for a higher-is-better marker and above it for a
lower-is-better one. `sideOfRange` now reads the side off the numbers, and the wording softens for
borderline ("is just below its usual range") and hardens for critical ("is well above range").

**Verified** by driving two profiles end to end: onboarding creates the first person, the v1 backup
imports, a second person is added, her MyChart-format lipid panel is pasted and correctly detected
as hers, and switching back leaves the first person's full history untouched. An HDL value that
reads "Below range" on female bands reads "Borderline" on male ones — the check that proves ranges
follow the profile and not the app. 263 → 283 tests.

### 2026-09-01 — real reports, and the parser rebuilt around them

The parser was tested against a private corpus of real lab PDFs spanning several years, in two
families of layout: Epic/MyChart exports from US labs, and printed panels from Indian hospitals.
(The corpus itself is personal health data and is deliberately not in this repository — only the
behaviours it exposed are recorded here.)

Running the existing parser over them was the useful part: **it could not read the MyChart layout at
all**, and worse, it read a "Hemoglobin A1C" row as a haemoglobin of 1. Testing against invented
fixtures had hidden every one of these:

1. **Split-line layouts were invisible.** An Epic PDF flattens to a two-column table where the
   marker names sit on one line and their values two lines below. The parser now reads that layout,
   but only when the value count matches the label count exactly and the label line has no unnamed
   column left over — which is what keeps an axis-tick row (`200 200 150 150`) or a stray "A/G
   Ratio" column from being taken as a result.
2. **`hemoglobin` matched inside `Hemoglobin A1C`.** Aliases were already sorted longest-first;
   "hemoglobin a1c" simply was not one of them. Added, along with the other names these labs use.
3. **A digit inside a word became a result.** `(Enzymatic UV without P5P)` gave an AST of 5. The
   number pattern now refuses digits adjacent to letters, which also stops `10E3/uL` reading as 10.
4. **`hr` matched inside `mm/hr`**, so an ESR row logged a heart rate of 0. Alias removed.
5. **Prose was read as data.** "Random glucose of 200 mg/dL or greater in patients with…" was
   imported as a random glucose of 200. Function words between a marker name and a number, or a line
   long enough to be a sentence, now demote a hit below the auto-select threshold.
6. **The wrong column was taken.** "A/G Ratio | Total Bilirubin" has two value columns and one
   nameable label, so the count matched by coincidence and the A/G ratio was filed as bilirubin.
   Single-label rows with leftover text on the label line are now refused.
7. **A doubtful hit blocked a good one.** Claiming a marker on an implausible reading (RDW-SD 36.7)
   meant the real RDW-CV row later in the file was skipped. Hits below the confidence threshold no
   longer claim their marker, and the best reading per marker wins at the end.
8. **Unit spellings and scales.** cells/cumm, Lakhs/cumm, mill/cumm, 10E3/uL, 10*3/uL, gm/dl and
   IU/L are now recognised and *scaled* (cells/cumm divides by 1000, Lakhs/cumm multiplies by 100).
   Sodium, potassium and chloride declare mmol/L, MCHC declares %, and T3 declares ng/mL — all
   equivalences that previously read as unrecognised units.
9. **Initialisms with dots.** `R.B.C`, `M.C.H.C`, `P.C.V` now normalise to `rbc`, `mchc`, `pcv`, and
   a specimen prefix like `S.Albumin` no longer hides the marker behind it.
10. **Derived markers were parseable.** eGFR, eAG and non-HDL could be imported as stored readings,
    which would have broken the compute-at-read-time invariant. They are excluded from the parser.

Also added `basophils` (a standard differential component present in every CBC in the set) and a
bare `Glucose` alias that is deliberately surfaced *unticked*, because a metabolic panel does not
say whether the draw was fasting.

**Verification that mattered:** after the fixes, the parser was run over the whole corpus and its
output compared, reading by reading, against the same values transcribed by hand. **Zero
disagreements across every reading.** The parser also found a thyroid panel several pages into one
report that the manual transcription had missed — so the cross-check corrected the data, not just
the code.

Test count 245 → 263; the new cases are the real report shapes, not invented ones.


### 2026-08-31 — v1.0.0, first build

Built the whole app in one pass: catalogue and pure logic first (with tests), then the database and
UI, then verified by running it.

**Bugs found and fixed during the build**, each one worth recording because none of them were
visible without actually looking:

1. **`relativeDate` reported exactly two years as "1 year ago"** — it divided days by an average
   year length. Replaced with calendar-aware `monthsBetween`, which uses the same
   day-of-month-must-have-passed rule as `ageAt`. Caught by a unit test.
2. **Thousands separators were destroying values** — `normaliseText` replaced commas with spaces
   before numbers were read, so "1,024 pg/mL" parsed as 1. Now digit-group commas are stripped
   first. Caught by a unit test.
3. **46 reference bands were one display step off**, so Vitamin D's range read as "29.1 – 100.0"
   instead of "30.0 – 100.0". Boundaries had been written as round integers on markers that display
   decimals. Fixed across the catalogue and locked in by a test that asserts the printed range of
   every single marker. Caught by looking at a screenshot.
4. **The importer dropped Total Cholesterol from a real report** — any line containing "Ref:" lost
   confidence, but printing the reference range beside the result is exactly how labs lay a row out.
   The penalty now applies only when the range hint comes *before* the number. Caught by a
   screenshot: an insight cited a 15-month-old value as the latest.
5. **The trend chart clipped its own Y axis**, rendering 178.35 as "78.35". Axis width is now
   computed from the domain, the negative left margin is gone, and bounds round outward to a
   readable step. Caught by a screenshot.
6. **The chart's axis ran below zero** for a marker whose readings sat far under its healthy band.
   Now clamped at zero for non-negative quantities. Caught by a screenshot.
7. **Onboarding could come back after being completed** — it awaited the async profile write to
   IndexedDB before the synchronous "onboarded" flag, so a fast tap through to the next screen left
   the overlay up. Now it dismisses first and saves after. Caught by the browser test.

**Verification:** 245 unit tests; a production build; and a 20-step Playwright run through
onboarding → paste-import a report → save → home → report detail → trends → marker detail → a
second and third report → log vitals → more → dark mode, with screenshots at every step and derived
markers (BMI, eGFR) asserted to render.
