/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        teal: '#04AA6D',
        mint: '#f1f1f1',
        coral: '#ff5722',
        sand: '#ffffff'
      },
      boxShadow: {
        card: '0 8px 20px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
};
