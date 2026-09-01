import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, Copy, Check, ShieldAlert } from 'lucide-react';
import { buildMarkerShare, pickShareStrategy } from '../../utils/shareText.js';
import { drawMarkerCard, canvasToPngFile } from '../../utils/shareCard.js';
import useUIStore from '../../store/uiStore.js';
import Modal from '../ui/Modal.jsx';

// Send one marker to someone — WhatsApp, or anywhere else the phone can share.
//
// Everything about this screen is built around the fact that sharing is the one
// action that takes health data OFF the device: you see the exact card before
// it goes, the person's name is left off unless you turn it on, and the sheet
// says plainly that the app cannot get it back afterwards.
export default function ShareSheet({ isOpen, onClose, row, sex, units, profileName, series = [] }) {
  const showToast = useUIStore((s) => s.showToast);
  const canvasRef = useRef(null);
  const [includeName, setIncludeName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = useMemo(
    () => buildMarkerShare({ row, sex, units, profileName, includeName }),
    [row, sex, units, profileName, includeName]
  );

  // Redraw whenever the card's content changes, including the name toggle, so
  // the preview is always exactly what would be sent.
  useEffect(() => {
    if (!isOpen || !share || !canvasRef.current) return;
    drawMarkerCard(canvasRef.current, share, series);
  }, [isOpen, share, series]);

  if (!share) return null;

  const filename = `${share.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const file = await canvasToPngFile(canvasRef.current, filename);
      const strategy = pickShareStrategy(typeof navigator === 'undefined' ? null : navigator, file);

      if (strategy === 'file' && file) {
        await navigator.share({ files: [file], text: share.text, title: share.title });
      } else if (strategy === 'text') {
        await navigator.share({ text: share.text, title: share.title });
      } else if (strategy === 'clipboard') {
        await navigator.clipboard.writeText(share.text);
        showToast('Copied — paste it into WhatsApp', { type: 'success' });
      } else if (file) {
        download(file, filename);
        showToast('Card saved — attach it in WhatsApp', { type: 'success' });
      }
    } catch (error) {
      // A cancelled share rejects, and is not a failure worth shouting about.
      if (error?.name !== 'AbortError') {
        console.error('Share failed:', error);
        showToast('Could not share that. The card was saved instead.', { type: 'error' });
        const file = await canvasToPngFile(canvasRef.current, filename);
        if (file) download(file, filename);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(share.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Could not copy on this device.', { type: 'error' });
    }
  }

  async function saveImage() {
    const file = await canvasToPngFile(canvasRef.current, filename);
    if (file) {
      download(file, filename);
      showToast('Card saved to your downloads', { type: 'success' });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share this reading" subtitle="You choose exactly what goes">
      <div className="mb-4 overflow-hidden rounded-2xl" style={{ border: '1px solid var(--color-ivory)' }}>
        <canvas ref={canvasRef} className="block w-full" style={{ height: 'auto' }} />
      </div>

      <button
        onClick={() => setIncludeName(!includeName)}
        role="switch"
        aria-checked={includeName}
        className="mb-3 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left"
        style={{ background: 'var(--color-ivory)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Include {profileName || 'the name'}
          </p>
          <p className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            Off by default — a number alone identifies nobody
          </p>
        </div>
        <span
          className="relative h-6 w-11 flex-shrink-0 rounded-full"
          style={{ background: includeName ? 'var(--color-pulse)' : 'var(--color-ash)' }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full"
            style={{
              left: includeName ? 22 : 2,
              background: '#ffffff',
              transition: 'left var(--dur-standard) var(--ease-out)',
            }}
          />
        </span>
      </button>

      <button
        onClick={send}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-sans text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
      >
        <Share2 size={16} /> {busy ? 'Preparing…' : 'Share'}
      </button>

      <div className="mt-2 flex gap-2">
        <button
          onClick={copyText}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-sans text-xs font-semibold"
          style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy as text'}
        </button>
        <button
          onClick={saveImage}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-sans text-xs font-semibold"
          style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
        >
          <Download size={14} /> Save image
        </button>
      </div>

      <div className="mb-2 mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: 'var(--color-ivory)' }}>
        <ShieldAlert size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-ash)' }} />
        <p className="font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          This is the one thing in HealthTrace that sends your health data off this device. Once it is
          in a chat it is on their phone and their backup, and the app cannot take it back.
        </p>
      </div>
    </Modal>
  );
}

function download(file, filename) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
