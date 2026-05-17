import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/hooks/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1F4A36',
          deep: '#143025',
          soft: '#2E6149',
        },
        sage: {
          DEFAULT: '#9DB6A0',
          soft: '#C9D8CC',
          mist: '#E8EEE8',
          tint: '#F1F5F1',
        },
        charcoal: {
          DEFAULT: '#2F3433',
          2: '#4A504F',
          3: '#6F7574',
        },
        line: '#E5E2DA',
        graysoft: '#F0EDE5',
        cream: {
          DEFAULT: '#F6F3EC',
          2: '#EFEBE0',
        },
        paper: '#FFFFFF',
        warm: '#E8B968',
        coral: '#D97757',
        berry: '#B65672',
        sky: '#6A95B8',
      },
      fontFamily: {
        display: ['GmarketSans', 'Pretendard', 'system-ui', 'sans-serif'],
        body: ['Pretendard', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '14px',
        lg: '20px',
        xl: '28px',
      },
      boxShadow: {
        1: '0 1px 2px rgb(31 74 54 / 0.04), 0 2px 8px rgb(31 74 54 / 0.04)',
        2: '0 2px 6px rgb(31 74 54 / 0.05), 0 12px 32px rgb(31 74 54 / 0.08)',
        3: '0 6px 20px rgb(31 74 54 / 0.08), 0 24px 60px rgb(31 74 54 / 0.12)',
      },
      maxWidth: {
        layout: '1280px',
      },
      letterSpacing: {
        tightx: '-0.02em',
        body: '-0.005em',
        wide04: '0.04em',
        wide06: '0.06em',
        wide08: '0.08em',
        wide16: '0.16em',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, rgba(31,74,54,0.05) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-22': '22px 22px',
      },
    },
  },
  plugins: [],
};

export default config;
