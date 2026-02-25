/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        millennium: {
          DEFAULT: '#BD0050',
          hover: '#9E0043',
          light: '#FFF0F5',
        }
      },
      fontFamily: {
        sans: ['"Open Sans"', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
