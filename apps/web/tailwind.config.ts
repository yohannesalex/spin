import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0f17', 900: '#111827', 800: '#1a2233', 700: '#263044', 600: '#37425a' },
        gold: { 300: '#fde68a', 400: '#fbbf24', 500: '#f59e0b' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'Noto Sans Ethiopic', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
