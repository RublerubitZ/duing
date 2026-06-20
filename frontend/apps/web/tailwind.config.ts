import type { Config } from 'tailwindcss';

import tailwindcssAnimate from 'tailwindcss-animate';

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
        sky: {
          DEFAULT: '#6A95B8',
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // shadcn/ui 시맨틱 토큰 — 두잉 토큰(globals.css :root)에 매핑. 기존 팔레트/borderRadius 는 유지.
        // `<alpha-value>` 슬롯으로 opacity 모디파이어(bg-primary/50 등) 지원.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
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
        // 4: 떠 있는 플로팅 패널용 — 카드(3)보다 한 단계 높은 elevation.
        4: '0 12px 32px rgb(20 48 37 / 0.14), 0 36px 90px rgb(20 48 37 / 0.22)',
      },
      // 두잉 모션 토큰 — 임의값(duration-[250ms]·ease-[cubic-bezier(...)])이 tailwindcss-animate 와
      // 충돌해 ambiguous 경고를 내므로 명명 유틸리티로 승격(duration-250·ease-duing).
      transitionDuration: {
        250: '250ms',
        600: '600ms',
      },
      transitionTimingFunction: {
        duing: 'cubic-bezier(.2, .7, .2, 1)',
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
      keyframes: {
        'slide-in-from-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0%)' },
        },
        'slide-out-to-left': {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'slide-in-from-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0%)' },
        },
        'slide-out-to-right': {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // 진입 오버슈트를 8px 로 둔다 — 16px 일 때 카드가 컨테이너 밖으로 잠깐(<0.1s) 새던 현상 완화.
        // 컨테이너 overflow-hidden 은 프리뷰 버튼 포커스 링까지 잘라 a11y 를 해치므로 오버슈트 축소로 대응.
        'preview-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'preview-in-reverse': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-from-right 400ms cubic-bezier(0.32, 0, 0.2, 1) both',
        'slide-out-left': 'slide-out-to-left 400ms cubic-bezier(0.32, 0, 0.2, 1) both',
        'slide-in-left': 'slide-in-from-left 400ms cubic-bezier(0.32, 0, 0.2, 1) both',
        'slide-out-right': 'slide-out-to-right 400ms cubic-bezier(0.32, 0, 0.2, 1) both',
        'preview-in': 'preview-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'preview-in-reverse': 'preview-in-reverse 520ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  safelist: ['animate-preview-in', 'animate-preview-in-reverse'],
  plugins: [tailwindcssAnimate],
};

export default config;
