import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp } from 'lucide-react';
import { useHealthData } from '../hooks/useHealth.js';
import { CATEGORIES } from '../data/categories.js';
import { normaliseText } from '../utils/parseReport.js';
import useSettingsStore from '../store/settingsStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import MarkerRow from '../components/health/MarkerRow.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

// Everything you track, grouped the way a lab groups it. Tap any marker for
// its full history.
export default function TrendsPage() {
  const navigate = useNavigate();
  const data = useHealthData();
  const units = useSettingsStore((s) => s.units);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const rows = useMemo(() => {
    const q = normaliseText(query);
    return data.rows.filter((row) => {
      if (category !== 'all' && row.marker.category !== category) return false;
      if (!q) return true;
      return (
        normaliseText(row.marker.name).includes(q) ||
        row.marker.aliases.some((alias) => alias.includes(q))
      );
    });
  }, [data.rows, query, category]);

  const groups = useMemo(() => {
    const out = [];
    for (const cat of CATEGORIES) {
      const inCategory = rows.filter((row) => row.marker.category === cat.key);
      if (inCategory.length) out.push({ category: cat, rows: inCategory });
    }
    return out;
  }, [rows]);

  // Only offer the filters that would actually return something.
  const availableCategories = CATEGORIES.filter((cat) =>
    data.rows.some((row) => row.marker.category === cat.key)
  );

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Trends"
        subtitle={data.rows.length ? `${data.rows.length} markers tracked` : 'Your history, marker by marker'}
      />

      {!data.loading && data.rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing to chart yet"
          body="Once you have logged a marker twice, its trend line appears here — with the healthy range drawn behind it."
          action={
            <button
              onClick={() => navigate('/reports/new')}
              className="rounded-xl px-5 py-3 font-sans text-sm font-semibold"
              style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
            >
              Add a report
            </button>
          }
        />
      ) : (
        <>
          <div className="px-5 pt-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ash)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your markers"
                className="w-full rounded-xl py-3 pl-9 pr-3 font-sans text-sm outline-none"
                style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>
              All
            </Chip>
            {availableCategories.map((cat) => (
              <Chip key={cat.key} active={category === cat.key} onClick={() => setCategory(cat.key)}>
                {cat.short}
              </Chip>
            ))}
          </div>

          <div className="px-5 pt-4">
            {groups.length === 0 && (
              <p className="py-10 text-center font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Nothing matches “{query}”.
              </p>
            )}

            {groups.map((group) => (
              <section key={group.category.key} className="mb-6">
                <h2 className="mb-2.5 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                  {group.category.name}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {group.rows.map((row) => (
                    <MarkerRow
                      key={row.markerKey}
                      row={row}
                      sex={data.sex}
                      units={units}
                      onClick={() => navigate(`/markers/${row.markerKey}`)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-full px-3.5 py-2 font-sans text-xs font-semibold"
      style={{
        background: active ? 'var(--color-pulse)' : 'var(--color-chalk)',
        border: `1px solid ${active ? 'var(--color-pulse)' : 'var(--color-ivory)'}`,
        color: active ? '#ffffff' : 'var(--color-text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
