// Draws the picture that gets sent.
//
// Straight 2D canvas rather than a screenshot library: it is a few hundred
// bytes instead of a dependency, it renders identically on every device, and it
// cannot accidentally capture anything that happens to be on screen — the card
// contains exactly the fields passed to it and nothing else.
//
// Browser-only by nature, so the WORDS it draws are built and tested in
// shareText.js; this file is only layout.


const W = 1080;
const H = 820;
const PAD = 72;

// The card is drawn in fixed light colours rather than the app's theme tokens:
// it is going into someone else's chat, on someone else's screen, and it should
// look the same for all of them.
const INK = '#0F172A';
const MUTED = '#64748B';
const FAINT = '#94A3B8';
const SURFACE = '#FFFFFF';
const CANVAS_BG = '#F5F7FA';

const STATUS_COLORS = {
  optimal: '#0D9488',
  borderline: '#D97706',
  high: '#E11D48',
  low: '#2563EB',
  critical: '#9F1239',
  unknown: '#94A3B8',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render a marker share card onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} share  output of buildMarkerShare()
 * @param {Array}  series readings, oldest first, for the trend line
 */
export function drawMarkerCard(canvas, share, series = []) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !share) return;

  canvas.width = W;
  canvas.height = H;
  const accent = STATUS_COLORS[share.status] ?? STATUS_COLORS.unknown;

  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, W, H);

  // Card
  // Card
  ctx.fillStyle = SURFACE;
  roundRect(ctx, 40, 40, W - 80, H - 80, 40);
  ctx.fill();

  // A status-coloured spine down the left edge, so the verdict reads before any
  // text does. Clipped to the card rather than drawn as its own rounded rect —
  // a 14px bar with a 40px corner radius folds in on itself.
  ctx.save();
  roundRect(ctx, 40, 40, W - 80, H - 80, 40);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(40, 40, 16, H - 80);
  ctx.restore();

  const left = PAD + 30;
  const maxTextWidth = W - PAD * 2 - 60;
  let y = 40 + PAD + 30;

  if (share.who) {
    ctx.fillStyle = MUTED;
    ctx.font = '500 30px "DM Sans", system-ui, sans-serif';
    ctx.fillText(truncate(ctx, share.who, maxTextWidth), left, y);
    y += 56;
  }

  ctx.fillStyle = INK;
  ctx.font = '800 52px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(truncate(ctx, share.title, maxTextWidth), left, y);
  // Clear the value's full cap height, or the digits climb into the title.
  y += 150;

  // The number
  ctx.fillStyle = accent;
  ctx.font = '800 132px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(share.value, left, y);
  const valueWidth = ctx.measureText(share.value).width;
  ctx.fillStyle = MUTED;
  ctx.font = '500 40px "DM Sans", system-ui, sans-serif';
  ctx.fillText(share.unit, left + valueWidth + 20, y);
  y += 60;

  // Status chip
  ctx.font = '700 30px "DM Sans", system-ui, sans-serif';
  const chipWidth = ctx.measureText(share.statusLabel).width + 48;
  ctx.fillStyle = accent;
  roundRect(ctx, left, y, chipWidth, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(share.statusLabel, left + 24, y + 38);
  y += 110;

  ctx.fillStyle = MUTED;
  ctx.font = '400 30px "DM Sans", system-ui, sans-serif';
  ctx.fillText(truncate(ctx, share.rangeLabel, maxTextWidth), left, y);
  y += 46;

  if (share.deltaLabel) {
    ctx.fillStyle = FAINT;
    ctx.font = '400 27px "DM Sans", system-ui, sans-serif';
    ctx.fillText(truncate(ctx, share.deltaLabel, maxTextWidth), left, y);
    y += 46;
  }

  // Whatever vertical room is left between the last line of text and the
  // footer goes to the trend. Computed from the footer's actual baseline, not
  // by subtracting guessed padding twice — that left too little to draw in.
  const trendTop = y + 14;
  const trendBottom = H - PAD - 72;
  drawTrend(ctx, series, accent, left, trendTop, maxTextWidth, trendBottom - trendTop);

  // Footer
  ctx.fillStyle = FAINT;
  ctx.font = '400 26px "DM Sans", system-ui, sans-serif';
  ctx.fillText(share.dateLabel ? `Measured ${share.dateLabel}` : '', left, H - PAD - 6);
  ctx.textAlign = 'right';
  ctx.fillText('HealthTrace', W - PAD - 30, H - PAD - 6);
  ctx.textAlign = 'left';
}

function drawTrend(ctx, series, color, x, y, width, height) {
  if (!series || series.length < 2 || height < 24) return;
  const values = series.map((point) => point.value).filter(Number.isFinite);
  if (values.length < 2) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const point = (index) => ({
    x: x + index * stepX,
    y: max === min ? y + height / 2 : y + height - ((values[index] - min) / span) * height,
  });

  // A soft fill under the line gives the shape at a glance in a chat thumbnail.
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  values.forEach((_, i) => {
    const p = point(i);
    ctx.lineTo(p.x, p.y);
  });
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
  ctx.fillStyle = `${color}1A`;
  ctx.fill();

  ctx.beginPath();
  values.forEach((_, i) => {
    const p = point(i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const last = point(values.length - 1);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function truncate(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

export function canvasToPngFile(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}
