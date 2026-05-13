/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Design tokens ────────────────────────────────────────
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',   // primary orange
          600: '#ea580c',
          700: '#c2410c',
        },
        status: {
          pending:    '#f59e0b',
          confirmed:  '#3b82f6',
          preparing:  '#8b5cf6',
          ready:      '#10b981',
          delivering: '#0ea5e9',
          delivered:  '#059669',
          cancelled:  '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'sans-serif'],
      },
      // ── Animations ───────────────────────────────────────────
      animation: {
        'slide-in':       'slideIn 0.35s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':        'fadeIn 0.2s ease-out',
        'pulse-slow':     'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-right':    'slideRight 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-left':     'slideLeft 0.3s cubic-bezier(0.16,1,0.3,1)',
        'scale-in':       'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
        'modal-backdrop': 'modalBackdrop 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateY(-16px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0)   scale(1)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideRight: {
          '0%':   { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideLeft: {
          '0%':   { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        modalBackdrop: {
          '0%':   { opacity: '0', backdropFilter: 'blur(0px)' },
          '100%': { opacity: '1', backdropFilter: 'blur(4px)' },
        },
      },
      // ── Transitions ──────────────────────────────────────────
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
