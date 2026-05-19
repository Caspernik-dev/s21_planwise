import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edfbf4', 100: '#d0f5e3', 200: '#a3eac8', 300: '#66d9a7',
          400: '#2ec27f', 500: '#21A663', 600: '#178550', 700: '#12663e',
          800: '#0e4f30', 900: '#093520', 950: '#041a10',
        },
        neutral: {
          0: '#ffffff', 50: '#f8f9f7', 100: '#f0f1ee', 200: '#e4e6e1',
          300: '#cdd0c8', 400: '#9ea39a', 500: '#717670', 600: '#555a52',
          700: '#3d4039', 800: '#272a24', 900: '#14160f',
        },
        accent: {
          50: '#e8f0ff', 100: '#c4d5ff', 200: '#92adff', 300: '#5a7ef9',
          400: '#3d5af1', 500: '#2741e0', 600: '#1c30c0', 700: '#14239a',
          800: '#0e1870', 900: '#090e47',
        },
        warm: {
          50: '#fff8e8', 100: '#ffefc0', 200: '#ffe08a', 300: '#ffcc4a',
          400: '#f5b800', 500: '#d49800', 600: '#b07800', 700: '#8a5c00',
          800: '#634200', 900: '#3d2900',
        },
        success: '#21A663',
        warning: '#f5b800',
        error: '#e8403a',
        info: '#3d5af1',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px',
        '2xl': '24px', '3xl': '32px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        hover: '0 4px 24px rgba(0,0,0,0.10)',
        brand: '0 4px 20px rgba(33,166,99,0.25)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease both',
        'fade-in': 'fadeIn 0.4s ease both',
        'scale-in': 'scaleIn 0.3s ease both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
