# HealthTrace

A free, offline-first PWA for tracking your family's health metrics — blood work, vitals, and the
trends underneath them. Everything lives on your device: no account, no server, no sync.

**Stack:** React 18 · Vite · Tailwind v3 · Dexie/IndexedDB · Zustand · React Router · Recharts ·
vite-plugin-pwa · Capacitor (for the Android APK).

---

## What it does

- **A profile per family member.** Reports, readings, targets and pinned markers all belong to one
  person, and reference ranges follow each person's own age and sex — the same HDL value reads
  differently for a man and a woman, and the app knows which it is looking at. Switch person from
  the chip on Home. Paste a report and the header's name files it under the right person.
- **74 markers out of the box** — lipids, blood sugar, CBC, kidney, liver, thyroid, vitamins and
  minerals, plus the vitals you measure at home (BP, pulse, weight, SpO₂, temperature).
- **Open a PDF, get your markers.** Point it at a lab PDF and HealthTrace reads the text out of the
  file on-device, turns it back into rows, and shows you every value it found — with the line it
  came from — before saving anything. Pasted text works the same way. It handles both the layout where the value sits beside the marker name and the
  two-column Epic/MyChart layout where it lands two lines below, converts between mg/dL and mmol/L,
  and scales the cell counts Indian labs print in cells/cumm and Lakhs/cumm. Anything it is unsure
  of is shown but left unticked. The parsing is plain regex and alias matching, on device — nothing
  is uploaded to be understood.
- **A verdict on every number.** Each reading is graded against published adult reference ranges
  (sex-specific where that genuinely differs) and shown on a range bar, so you see the healthy
  window and where you landed in it.
- **Trends with the range drawn behind them.** Every marker gets a chart with its healthy band
  shaded, per-point statuses, 3M/1Y/3Y/All windows, and the long-run drift per month.
- **Calculated markers, never stored.** BMI, eGFR (CKD-EPI 2021), non-HDL, total:HDL ratio, eAG and
  HOMA-IR are computed from your readings at read time — so deleting a reading takes everything
  derived from it with it, with no stale rows left behind.
- **Your doctor's targets override ours.** Set a personal target on any marker and the whole app
  grades that marker against your number instead of the population range.
- **Everything is editable and deletable.** Deleting a report deletes its readings and its
  attachment in one transaction.
- **Share a reading with your family.** Any marker renders as a card — value, verdict, reference
  range, trend — that goes straight into WhatsApp or anywhere else the phone can share, with text
  and image-download fallbacks. The name is left off unless you turn it on.
- **Keep the original document.** Attach the source PDF or a photo of the report to the record it
  produced. Stored on the device, left out of backups because blobs are heavy.
- **Export and import.** A JSON backup carries the whole household in one file and is validated row
  by row on the way back in; backups from before profiles existed still restore. CSV exports the
  person on screen, for a spreadsheet or a doctor.

## Getting it on your phone

**As a PWA** — open the GitHub Pages URL in Chrome and choose "Add to Home screen". It installs,
runs offline, and updates itself.

**As an APK** — every push to `main` builds a sideloadable APK and publishes it to
[Releases](../../releases). Download it on the phone, allow "install from unknown sources", open it.

Both are the same app. Their data is separate, because the browser and the WebView have separate
storage — pick one, or move between them with an export/import.

## Development

```bash
npm install
npm run dev      # vite dev server
npm test         # vitest — 311 tests over the pure logic
npm run build    # production build into dist/
```

The GitHub Pages build serves under `/healthtrace/`; `CAPACITOR_BUILD=true npm run build` serves
from `/` for the WebView. The Android project is generated in CI by `npx cap add android` and is
not committed.

## Where things live

| Path | What |
| --- | --- |
| `src/data/markers.js` | The catalogue: every marker, its unit, reference bands and report aliases |
| `src/utils/ranges.js` | Value → status. The single source of truth for what counts as healthy |
| `src/utils/parseReport.js` | The lab-report text parser |
| `src/utils/pdfText.js` | Rebuilds text lines from a PDF's positioned fragments |
| `src/utils/shareText.js` | What a shared card says |
| `src/utils/derived.js` | BMI, eGFR, non-HDL, eAG, HOMA-IR — computed, never stored |
| `src/utils/trends.js` | Series, deltas, slopes, ranking |
| `src/utils/insights.js` | The plain-English sentences on Home |
| `src/db/` | Dexie schema and every write, including the cascading deletes and profile CRUD |
| `src/pages/` | Home · Reports · Add · Trends · More, plus report, marker and profile detail |

`docs/ARCHITECTURE.md` has the full map.

## What it will not do

**It will not read numbers off a photo.** That needs OCR, and on a lab table — where meaning lives
in column alignment — OCR misreads often enough to be unsafe in a health record. A photo can be
attached to a report so the original is kept, but the values are typed in.

**It will not sync.** There is no server, so no background notifications and no backup unless you
export one.

## A word on what this is not

HealthTrace records and charts your numbers. It does not diagnose anything, and it is not a
substitute for your doctor. Reference ranges are general adult values and vary between labs — the
app says so wherever it shows a status, and every range can be overridden with a target your doctor
actually gave you.

Because there is no server, there is also no backup. Export a copy before you clear browser data,
uninstall the app, or change phone.
