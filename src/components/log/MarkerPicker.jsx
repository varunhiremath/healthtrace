import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { MARKERS } from '../../data/markers.js';
import { CATEGORIES } from '../../data/categories.js';
import { normaliseText } from '../../utils/parseReport.js';
import Modal from '../ui/Modal.jsx';

// Search across names, short labels AND the parser aliases, so typing "sgpt"
// or "a1c" finds the marker even though neither is its display name.
export default function MarkerPicker({ isOpen, onClose, onPick, selected = [], multi = false, exclude = [] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const results = useMemo(() => {
    const q = normaliseText(query);
    return MARKERS.filter((marker) => {
      if (marker.derived) return false; // computed, never entered by hand
      if (exclude.includes(marker.key)) return false;
      if (category !== 'all' && marker.category !== category) return false;
      if (!q) return true;
      return (
        normaliseText(marker.name).includes(q) ||
        normaliseText(marker.short).includes(q) ||
        marker.aliases.some((alias) => alias.includes(q))
      );
    });
  }, [query, category, exclude]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a marker" subtitle={`${results.length} available`}>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ash)' }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — try “a1c”, “sgpt”, “vitamin d”"
          className="w-full rounded-xl py-3 pl-9 pr-3 font-sans text-sm outline-none"
          style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
        <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </CategoryChip>
        {CATEGORIES.map((cat) => (
          <CategoryChip key={cat.key} active={category === cat.key} onClick={() => setCategory(cat.key)}>
            {cat.short}
          </CategoryChip>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 pb-4">
        {results.length === 0 && (
          <p className="py-8 text-center font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Nothing matches “{query}”.
          </p>
        )}
        {results.map((marker) => {
          const isSelected = selected.includes(marker.key);
          return (
            <button
              key={marker.key}
              onClick={() => {
                onPick(marker.key);
                if (!multi) onClose();
              }}
              className="flex items-center justify-between rounded-xl px-3.5 py-3 text-left"
              style={{
                background: isSelected ? 'var(--color-pulse-soft)' : 'var(--color-ivory)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {marker.name}
                </p>
                <p className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {marker.unit}
                </p>
              </div>
              {isSelected && <Check size={16} style={{ color: 'var(--color-pulse)' }} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-full px-3 py-1.5 font-sans text-xs font-semibold"
      style={{
        background: active ? 'var(--color-pulse)' : 'var(--color-ivory)',
        color: active ? '#ffffff' : 'var(--color-text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
