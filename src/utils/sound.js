import useSettingsStore from '../store/settingsStore.js';

// A tiny WebAudio synth — no samples, fully offline. Two cues only: something
// was saved, and something needs a look. Gated behind the sound preference and
// only ever fired from a user-driven moment.

let ctx;
let master;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(freq, startAt, duration, peak = 0.14) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 5, 8000);

  osc.type = 'triangle';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

const CUES = {
  // A rising major third: something landed.
  saved: [
    [587.33, 0, 0.18],
    [739.99, 0.07, 0.26],
  ],
  // A soft falling pair: worth a look, never alarming.
  flagged: [
    [493.88, 0, 0.2],
    [392.0, 0.1, 0.3],
  ],
  tick: [[880, 0, 0.06]],
};

export function playCue(kind = 'saved') {
  if (!useSettingsStore.getState().sound) return;
  const audio = ensureCtx();
  if (!audio) return;
  const now = audio.currentTime;
  for (const [freq, offset, duration] of CUES[kind] ?? CUES.saved) {
    note(freq, now + offset, duration);
  }
}
