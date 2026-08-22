/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          950: '#0d1f17',
          900: '#1a3a2a',
          800: '#1e4a35',
          700: '#2a5c42',
          600: '#3a7a58',
        },
        gold: {
          300: '#f0d080',
          400: '#d4a848',
          500: '#c9a84c',
          600: '#a8862a',
          700: '#8a6e1e',
        },
        cream: '#faf6ee',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'luxury-gradient': 'linear-gradient(135deg, #0d1f17 0%, #1a3a2a 50%, #0d1f17 100%)',
        'gold-gradient': 'linear-gradient(135deg, #c9a84c 0%, #f0d080 50%, #a8862a 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
