import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// A bottom sheet, portalled to <body> so a page transform can never trap the
// fixed overlay inside a non-viewport containing block. Capped at 90vh with the
// body scrolling inside, so a long form never pushes its own actions off screen.
export default function Modal({ isOpen, onClose, title, subtitle, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[62] flex items-end justify-center" onClick={onClose}>
      <div className="anim-fade-in absolute inset-0" style={{ background: 'rgba(15,23,42,0.55)' }} />
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl"
        style={{ background: 'var(--color-chalk)', animation: 'fadeSlideUp 300ms var(--ease-out)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--color-ivory)' }}
          >
            <X size={16} style={{ color: 'var(--color-ash)' }} />
          </button>
        </div>

        <div
          className="overflow-y-auto px-5"
          style={{ paddingBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
