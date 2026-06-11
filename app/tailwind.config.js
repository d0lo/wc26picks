/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        court: {
          950: '#03060F',
          900: '#060C1A',
          800: '#0A1326',
          700: '#0F1D35',
          600: '#162540',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
