/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from 'tailwindcss-animate'

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
        /* shadcn token bridge — registry components read from these */
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        body: ['Jost', '"Segoe UI"', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'luxury-gradient': 'linear-gradient(135deg, #0d1f17 0%, #1a3a2a 50%, #0d1f17 100%)',
        'gold-gradient': 'linear-gradient(135deg, #c9a84c 0%, #f0d080 50%, #a8862a 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'shimmer': 'shimmer 2s infinite',
        /* Marquee ticker — duplicated track translates -50%, loops seamlessly */
        marquee: 'marquee 28s linear infinite',
        /* FAQ accordion */
        'accordion-down': 'accordionDown 0.25s var(--ease-out)',
        'accordion-up': 'accordionUp 0.25s var(--ease-out)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        accordionDown: { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        accordionUp: { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
