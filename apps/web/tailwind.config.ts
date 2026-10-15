import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: warm gold. Fills use 400–500 with dark text; text on light backgrounds uses 600–800.
        gold: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#c47a06', 700: '#a16207', 800: '#854d0e' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'Noto Sans Ethiopic', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        lift: '0 4px 6px -1px rgb(15 23 42 / 0.06), 0 10px 24px -4px rgb(15 23 42 / 0.10)',
      },
    },
  },
  plugins: [],
} satisfies Config;
