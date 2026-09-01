// Reading a lab report straight out of its PDF.
//
// The parser in parseReport.js works on TEXT LAID OUT IN LINES, because that is
// what carries the meaning in a lab table — a marker name and its value share a
// row. A PDF has no lines: it has a bag of positioned text fragments. So the
// job here is to put the rows back together from coordinates before the parser
// ever sees the content.
//
// pdfjs is loaded lazily, on the first PDF a user opens. It is by far the
// largest dependency in the app and most sessions never need it; making it a
// separate chunk keeps the initial load — the thing that matters on a phone —
// unaffected.

// Text fragments whose baselines are within this many units are the same row.
// Lab tables are tightly set, and a superscript or a slightly-raised unit
// should not start a new line.
const ROW_TOLERANCE = 3;

/**
 * Rebuild text lines from pdfjs text items.
 *
 * Each item carries a 6-element transform matrix; [4] is x and [5] is y. Rows
 * are grouped by y (descending, since PDF y grows upward) and then ordered by x
 * so a two-column table reads left to right, exactly as it looks on the page.
 *
 * Pure and synchronous, so the part that actually decides the layout is
 * testable without a PDF or a browser.
 */
export function linesFromTextItems(items = []) {
  const rows = new Map();

  for (const item of items) {
    const text = item?.str;
    if (typeof text !== 'string' || !text.trim()) continue;
    const transform = item.transform;
    if (!Array.isArray(transform) || transform.length < 6) continue;

    const x = transform[4];
    const y = Math.round(transform[5]);
    // Snap to an existing row when one is close enough.
    let key = y;
    for (const existing of rows.keys()) {
      if (Math.abs(existing - y) <= ROW_TOLERANCE) {
        key = existing;
        break;
      }
    }
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ x, text });
  }

  return [...rows.entries()]
    // Down the page: larger y first.
    .sort((a, b) => b[0] - a[0])
    .map(([, fragments]) =>
      fragments
        .sort((a, b) => a.x - b.x)
        .map((f) => f.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

// Guard rails: a lab report is a handful of pages. Anything past this is either
// the wrong document or something that would lock up the phone.
export const MAX_PAGES = 30;
export const MAX_BYTES = 25 * 1024 * 1024;

export function describePdfLimit(file) {
  if (!file) return 'No file chosen.';
  if (file.size > MAX_BYTES) {
    return `That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB. HealthTrace reads files up to ${MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

let pdfjsPromise;

// One lazy load, shared by every later call.
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // The LEGACY build of pdfjs 3.x, deliberately. Newer majors emit
      // top-level await, which neither our browser target nor an older Android
      // WebView — the most likely place this app runs — can parse.
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
      // Vite turns this into a real, hashed asset URL that the service worker
      // precaches, so the worker resolves offline as well as online.
      const worker = new URL('pdfjs-dist/legacy/build/pdf.worker.min.js', import.meta.url);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.toString();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Extract the text of a PDF, laid back out in lines.
 *
 * @param {ArrayBuffer} data
 * @param {(page: number, total: number) => void} [onProgress]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean, empty: boolean }>}
 *
 * `empty` is the honest answer for a scanned report: a photograph of a page
 * embedded in a PDF carries no text layer, so there is nothing to read and the
 * caller should say so rather than showing "0 markers found" as if the parser
 * had failed.
 */
export async function extractPdfText(data, onProgress) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  try {
    const total = doc.numPages;
    const pages = Math.min(total, MAX_PAGES);
    const out = [];

    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      out.push(...linesFromTextItems(content.items));
      page.cleanup();
      onProgress?.(n, pages);
    }

    const text = out.join('\n');
    return {
      text,
      pages,
      truncated: total > pages,
      empty: text.replace(/\s/g, '').length < 20,
    };
  } finally {
    // Release the worker's copy of the document — on a phone this matters.
    doc.destroy();
  }
}
