/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', 'system-ui', 'sans-serif'],
        serif: ['"Times New Roman"', 'Times', 'serif'],
      },
      animation: {
        'spin-burst': 'spin-burst 3s cubic-bezier(0.8, 0, 0.2, 1) infinite',
        'shimmer': 'shimmer 1.5s linear infinite',
      },
      keyframes: {
        'spin-burst': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(1080deg)' },
        },
        'shimmer': {
          '0%': { 'background-position': '200% 0' },
          '100%': { 'background-position': '-200% 0' },
        },
      }
    },
  },
  plugins: [],
}
