import { defineConfig } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  {
    // 검사 범위: app·components + 루트 설정·계측 파일(instrumentation*.ts·middleware.ts·*.config.*·sentry*.ts).
    // test/·e2e/ 는 `next lint` 시절에도 린트 대상이 아니었고, 포함하면 그쪽 경고·에러 40여 건이 섞인다.
    // 루트 파일은 일부러 제외하지 않는다(설정 파일 실수도 잡는다). 나머지는 생성물 디렉터리(.next·.vercel·
    // coverage·playwright-report·test-results) — `next lint` 는 애초에 보지 않았지만 `eslint .` 은 훑는다.
    ignores: [
      'test/**',
      'e2e/**',
      'test-results/**',
      '.next/**',
      '.vercel/**',
      'coverage/**',
      'playwright-report/**',
      'next-env.d.ts',
    ],
  },
  {
    extends: [...nextCoreWebVitals, ...nextTypescript],
    linterOptions: {
      // `next lint` 파리티 — 미사용 eslint-disable 주석을 경고로 보고하지 않는다.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // eslint-plugin-react-hooks 7 의 recommended 는 React Compiler 에서 파생된 규칙을 여럿 켠다. 그중 이
      // 코드베이스가 현재 위반 중인 5개만 끈다(refs 90여·set-state-in-effect 45 등 실측). 나머지 컴파일러 파생
      // 규칙(use-memo·preserve-manual-memoization·immutability·globals·error-boundaries·set-state-in-render·
      // config·gating·unsupported-syntax)은 버그 탐지용으로 켜 두고, 정당한 패턴을 막을 때만 개별로 끈다.
      // 컴파일러 도입 시 이 5개도 재검토.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      // `_` 접두 = 의도된 미사용 — 인자·변수·catch 의 에러·구조분해 자리 비움 모두 같은 규약이다(exhaustive
      // check `((_: never) => {})(x)` 등). `next lint` 15 에서는 경고가 아니었고, 16 의 typescript 프리셋만
      // 두면 그런 이름이 no-unused-vars 경고로 뜬다.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'alert',
          message: '임베디드 브라우저에서 억제되거나 throw 됩니다. ToastProvider 의 useToast 를 사용하세요.',
        },
        {
          name: 'confirm',
          message: '임베디드 브라우저에서 억제되거나 throw 됩니다. @/app/_components/ConfirmDialog 를 사용하세요.',
        },
        {
          name: 'prompt',
          message: '임베디드 브라우저에서 throw 됩니다. 인라인 입력 UI 로 대체하세요.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'alert', message: 'ToastProvider 의 useToast 를 사용하세요.' },
        { object: 'window', property: 'confirm', message: '@/app/_components/ConfirmDialog 를 사용하세요.' },
        { object: 'window', property: 'prompt', message: '인라인 입력 UI 로 대체하세요.' },
        { object: 'globalThis', property: 'alert', message: 'ToastProvider 의 useToast 를 사용하세요.' },
        { object: 'globalThis', property: 'confirm', message: '@/app/_components/ConfirmDialog 를 사용하세요.' },
        { object: 'globalThis', property: 'prompt', message: '인라인 입력 UI 로 대체하세요.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/navigation',
              importNames: ['useRouter'],
              message: '오프라인 가드를 위해 @/app/_lib/useGuardedRouter 의 useGuardedRouter 를 사용하세요.',
            },
            {
              name: 'next-view-transitions',
              importNames: ['useTransitionRouter'],
              message: '오프라인 가드를 위해 @/app/_lib/useGuardedRouter 의 useGuardedRouter 를 사용하세요.',
            },
            {
              name: '@duing/stores',
              importNames: ['selectIsAuthenticated'],
              message:
                '화면 렌더의 인증 판정은 @/app/_lib/useSeededAuthStatus 의 useSeededAuthStatus 를 사용하세요. selectIsAuthenticated 는 packages 의 인증 종속 쿼리 게이트 전용입니다.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/_lib/useGuardedRouter.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // 옛 리다이렉트 주소로의 링크 금지 — typedRoutes 는 next.config redirects() 의 source 를 유효 라우트로
    // 취급해서(설정으로 끌 수 없다), 페이지를 지운 옛 주소로 링크해도 타입 검사를 통과하고 리다이렉트를 한 번 더 탄다.
    // 옛 주소를 redirects() 에 추가할 때 여기에도 같이 추가할 것.
    // 경로 비교용 접두 문자열('/facilities/' — 탭 판정 등)은 링크가 아니라 허용한다(슬래시 뒤 한 글자 이상만 금지).
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\/facilities\\/./]',
          message:
            '옛 시설 상세 주소(/facilities/{id})는 없어졌습니다. /facilities?facilityId={id} 로 링크하세요.',
        },
        {
          selector: 'TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/facilities\\//]',
          message:
            '옛 시설 상세 주소(/facilities/{id})는 없어졌습니다. /facilities?facilityId={id} 로 링크하세요.',
        },
        {
          selector: "BinaryExpression[operator='+'] > Literal.left[value=/^\\/facilities\\/$/]",
          message:
            '옛 시설 상세 주소(/facilities/{id})는 없어졌습니다. /facilities?facilityId={id} 로 링크하세요.',
        },
        {
          selector:
            'Literal[value=/^\\/admin\\/(facility-crawl|facility-bookings\\/submission)\\/?([?#].*)?$/]',
          message:
            '관리자 옛 경로입니다. /admin/facility-bookings?tab=crawl 또는 ?tab=prepare 로 링크하세요.',
        },
        {
          selector:
            'TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=/^\\/admin\\/(facility-crawl|facility-bookings\\/submission)\\/?([?#].*)?$/]',
          message:
            '관리자 옛 경로입니다. /admin/facility-bookings?tab=crawl 또는 ?tab=prepare 로 링크하세요.',
        },
        {
          selector:
            'TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/admin\\/(facility-crawl|facility-bookings\\/submission)\\/?[?#]/]',
          message:
            '관리자 옛 경로입니다. /admin/facility-bookings?tab=crawl 또는 ?tab=prepare 로 링크하세요.',
        },
      ],
    },
  },
]);
