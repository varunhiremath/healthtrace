import { AlertTriangle, CheckCircle2, Info, TrendingUp } from 'lucide-react';

const TONES = {
  good: { color: 'var(--status-optimal)', soft: 'var(--status-optimal-soft)', Icon: CheckCircle2 },
  warn: { color: 'var(--status-borderline)', soft: 'var(--status-borderline-soft)', Icon: TrendingUp },
  alert: { color: 'var(--status-high)', soft: 'var(--status-high-soft)', Icon: AlertTriangle },
  neutral: { color: 'var(--color-pulse)', soft: 'var(--color-pulse-soft)', Icon: Info },
};

export default function InsightCard({ insight, onClick }) {
  const tone = TONES[insight.tone] ?? TONES.neutral;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <span
        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: tone.soft }}
      >
        <tone.Icon size={15} style={{ color: tone.color }} />
      </span>
      <div className="min-w-0">
        <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {insight.title}
        </p>
        <p className="mt-0.5 font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {insight.body}
        </p>
      </div>
    </Wrapper>
  );
}
