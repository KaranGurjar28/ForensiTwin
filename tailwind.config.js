/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#eceff1',
        panel: '#f7f8f9',
        ink: '#161c22',
        rule: '#cfd6db',
        mute: '#5b6975',
        evidence: '#f5c400',
        pre: '#1d6fb8',
        post: '#d9412b',
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
