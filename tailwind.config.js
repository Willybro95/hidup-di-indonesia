/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', surface2: 'var(--surface2)', ink: 'var(--ink)', muted: 'var(--muted)', edge: 'var(--edge)',
        pink: 'var(--pink)', yellow: 'var(--yellow)', teal: 'var(--teal)', good: 'var(--good)', bad: 'var(--bad)', violet: 'var(--violet)',
      },
      fontFamily: { display: ['Bungee', '"Arial Black"', 'Impact', 'sans-serif'], body: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
