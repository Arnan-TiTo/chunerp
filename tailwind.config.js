/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Sampled from the Chul Farm paper-cut key art ──────────────────
        /** Deep shade under the stilt houses — chrome, table headers, primary. */
        forest: {
          DEFAULT: '#2a5340',
          dark: '#1c3d2d',
          light: '#3d6b53',
          soft: 'rgba(42,83,64,0.10)',
        },
        /** Rice-field and bush green — confirm actions. */
        sage: {
          DEFAULT: '#6e8b54',
          dark: '#55703f',
          soft: 'rgba(110,139,84,0.13)',
        },
        /** Sunlit terraces — success, active navigation, focus. */
        meadow: {
          DEFAULT: '#9cb35e',
          deep: '#5f7a3c',
          soft: 'rgba(200,205,138,0.28)',
        },
        /** Teak roofs, cart wheel, sand path — warnings and money. */
        tan: {
          DEFAULT: '#a8763f',
          dark: '#7d5629',
          soft: 'rgba(235,196,155,0.32)',
        },
        /** Villagers' indigo and the far hills — information. */
        indigo: {
          DEFAULT: '#46617f',
          dark: '#33485f',
          soft: 'rgba(70,97,127,0.12)',
        },
        /** Mauve sashes — one work-area accent. */
        mauve: {
          DEFAULT: '#a5717f',
          dark: '#855967',
          soft: 'rgba(194,151,161,0.22)',
        },
        /** Warm brick for errors — not in the art, but keyed to the teak tones. */
        danger: {
          DEFAULT: '#9a4234',
          soft: 'rgba(154,66,52,0.10)',
        },
        ink: {
          DEFAULT: '#22302a',
          dim: '#5c6b62',
          faint: '#8a9890',
        },
        line: {
          DEFAULT: '#dde5da',
          soft: '#e9efe6',
          faint: '#f1f5ef',
        },
        canvas: '#f3f6f1',
        sunken: '#fafcf8',
      },
      fontFamily: {
        sans: ['Sarabun', '"Leelawadee UI"', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '14px',
        pill: '999px',
      },
      boxShadow: {
        sm: '0 2px 6px rgba(30,50,40,.05)',
        md: '0 4px 12px rgba(30,50,40,.07)',
        lg: '0 18px 40px rgba(30,50,40,.14)',
        topbar: '0 2px 10px rgba(20,40,30,.16)',
        sidebar: '2px 0 10px rgba(30,50,40,.07)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideInRight: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp .45s cubic-bezier(.2,.7,.3,1)',
        'fade-up-fast': 'fadeUp .25s ease',
        'fade-in': 'fadeIn .16s ease-out',
        'slide-in-right': 'slideInRight .22s cubic-bezier(.32,.72,0,1)',
      },
    },
  },
  plugins: [],
}
