# Engineering guidelines — HealthTrace

## Health data comes first

**1. A number without its range is meaningless.** Never show a reading without the context that
makes it readable: its status, its reference range, or its position on a range bar. This is the
whole reason the app exists.

**2. One place decides what "healthy" means.** `utils/ranges.js` turns a value into a status, and
nothing else may. If a component picks its own colour for a number, the app has two truths.

**3. Never invent a health claim.** `utils/insights.js` may only:
   - restate a number the user entered,
   - compare it to a published reference range,
   - describe a change between two of their own readings.

   No diagnosis. No prediction. No "you should". No cause-and-effect. If the data does not support
   a sentence, produce no sentence — an empty list is honest.

**4. Say plainly what the ranges are.** They are general adult values, they vary by lab, and they
are not a diagnosis. Every screen that shows a status says so, or is one tap from something that
does.

**5. Say plainly what the app cannot do.** There is no server, so: no background notifications
(only an in-app note when you open it), and no backup unless the user exports one. Never phrase a
limitation as though it were a feature.

**6. Be cautious when reading someone's report.** The paste parser never writes on its own. It
shows every value it found, the exact line it came from, flags anything it is unsure about, and
refuses to convert a unit it does not recognise rather than guessing.

## Data integrity

- **Store canonical, convert at display.** Every reading is stored in its marker's `unit`
  (`data/markers.js`). `utils/units.js` converts for entry and display only.
- **Derived values are computed, never stored.** This is what makes deletion clean.
- **Deletes revert everything.** A report's readings and attachment go with it, in one transaction.
- **Anything addable is editable and deletable.** No exceptions.
- **Dates are `YYYY-MM-DD` strings**, parsed at local noon so no timezone shift can move a reading
  to the wrong day. Never store a `Date` or an epoch for the day a reading belongs to.
- **Imports validate before they write.** Bad rows are reported by line number and skipped; a
  malformed file changes nothing.
- **Migrations are append-only.** New `db.version(n)`; never edit a shipped version.

## Code

- Pure logic lives in `src/utils/*.js` with a co-located `*.test.js`. If it can be tested in node,
  it must be.
- Tests assert behaviour, not implementation. The reference-range test asserts the string a user
  reads, which is what actually broke in practice.
- Components reference CSS variables from `styles/tokens.css`, not raw hex or Tailwind colour
  classes, so the whole app re-skins from one file.
- Modals use `createPortal` to `document.body`, cap at 90vh, and scroll internally.
- Comments explain *why*, especially where a decision looks odd (band boundaries, the parser's
  confidence rules, dismiss-before-save in onboarding). Don't narrate *what*.

## UX

- Android-first. Big tap targets, one column, max-width 420px, bottom navigation.
- Content over chrome. A screen should open on the user's data, not a header.
- Numbers use `.tnum` (tabular figures) so columns do not dance.
- Every empty state says what to do next and links to it.
- Motion is subtle and always gated on `settingsStore.effects` and `prefers-reduced-motion`.
- Inputs are 16px so iOS does not zoom on focus.

## Verifying a change

1. `npm test` — the logic.
2. `npm run build` — must stay clean.
3. **Run the app.** Build, `npx vite preview`, drive it with Playwright and look at the
   screenshots. Every UI bug found during the first build — a clipped chart axis, a mis-stated
   reference range, an onboarding overlay that came back — was invisible to the unit tests and
   obvious in a screenshot.
