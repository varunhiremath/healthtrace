import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';

// The '/' route exists only to bounce into the app. Keeping it separate means a
// bookmark, a Capacitor WebView and a GitHub Pages deep link all land somewhere
// sensible.
export default function LoadingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/home', { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3" style={{ background: 'var(--color-canvas)' }}>
      <span className="anim-pulse-halo flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--color-pulse-soft)' }}>
        <HeartPulse size={26} style={{ color: 'var(--color-pulse)' }} />
      </span>
      <p className="font-display text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
        HealthTrace
      </p>
    </div>
  );
}
