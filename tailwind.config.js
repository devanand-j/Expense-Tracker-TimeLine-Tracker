/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif']
      },
      colors: {
        ink: '#0f172a',
        teal: '#04AA6D',
        'teal-dark': '#038a5c',
        'teal-light': '#e6f7f1',
        mint: '#f0f4f8',
        coral: '#f43f5e',
        sand: '#fafafa',
        brand: {
          50:  '#e6f7f1',
          100: '#c2eadb',
          200: '#85d5b7',
          300: '#47c093',
          400: '#04AA6D',
          500: '#038a5c',
          600: '#026b47',
          700: '#014d33',
          800: '#012e1f',
          900: '#000f0a'
        }
      },
      boxShadow: {
        card:    '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        'card-lg': '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        teal:    '0 4px 14px rgba(4,170,109,0.30)',
        'teal-sm': '0 2px 8px rgba(4,170,109,0.20)',
        glow:    '0 0 0 3px rgba(4,170,109,0.15)'
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem'
      },
      backgroundImage: {
        'gradient-teal': 'linear-gradient(135deg, #04AA6D 0%, #038a5c 100%)',
        'gradient-teal-sky': 'linear-gradient(135deg, #04AA6D 0%, #0ea5e9 100%)',
        'gradient-amber': 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
        'gradient-violet': 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        'gradient-sky': 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' }
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' }
        }
      }
    }
  },
  plugins: []
};
