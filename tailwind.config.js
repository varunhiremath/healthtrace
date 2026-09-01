/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // HealthTrace palette — clinical but warm. Values mirror tokens.css,
        // which is the single source of truth; these exist so Tailwind utility
        // classes can reach the same colours.
        canvas: '#F5F7FA',
        chalk: '#FFFFFF',
        ivory: '#EDF1F7',
        slate: '#1E293B',
        ink: '#0F172A',
        ash: '#94A3B8',
        pulse: '#4F46E5', // primary — indigo
        calm: '#0D9488', // in range — teal
        warn: '#D97706', // borderline — amber
        alert: '#E11D48', // out of range — rose
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", 'sans-serif'],
        sans: ["'DM Sans'", 'sans-serif'],
        mono: ["'DM Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
};
