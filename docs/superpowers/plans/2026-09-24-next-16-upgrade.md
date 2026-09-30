# Next.js 16 업그레이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next 15.5.26 → 16.3.6. 런타임 동작 불변, 바뀌는 것은 Turbopack 빌드와 ESLint 실행 방식뿐.

**Architecture:** 의존성 두 개 올리고, `next lint` 가 사라진 자리를 ESLint CLI + flat config 로 메운다. middleware.ts 는 Edge 런타임 그대로 유지(deprecation 경고만 감수, proxy 전환은 후속 PR). 죽은 Sentry webpack 옵션 제거. 코드 로직 변경 0.

**Tech Stack:** Next 16.3.6 (Turbopack), eslint-config-next 16.3.6 (eslint-plugin-react-hooks 7.1.1 동봉), ESLint 9.39 flat config, pnpm 9.

**Spec:** `docs/superpowers/specs/2026-09-24-next-16-upgrade-design.md`

## Global Constraints
- 모든 명령은 `frontend/` 에서 실행(pnpm 워크스페이스 루트). 패키지 필터명은 `@duing/web`.
- CI 동등 빌드 env: `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes` (워크트리엔 .env.local 이 없어 이 값 없이는 /login 페이지 데이터 수집에서 빌드가 실패한다 — 코드 결함 아님).
- 커밋 메시지: Conventional Commits 한국어 `type(scope): 대상 — 변경점`. Co-Authored-By/🤖 라인 금지.
- **push·PR 생성·머지는 구현자가 하지 않는다** — 컨트롤러가 리뷰 후 수행.
- 모든 주장은 실제 명령 출력 근거. 미검증 결과 보고 금지.
- `middleware.ts` 는 파일명·함수명·내용 모두 손대지 않는다.

## Review Focus
1. 빌드 로그의 경고가 "middleware deprecated" 1건뿐인지 — Turbopack 이 webpack 전용 설정을 발견하면 빌드가 실패하도록 돼 있으므로(Next 16 가이드) Sentry 옵션 제거 후에도 다른 webpack 흔적이 없어야 한다. Task 1 Step 6 이 확인.
2. `eslint .` 의 검사 범위 — `components/`·`instrumentation*.ts`·`middleware.ts`·루트 설정 파일은 검사되고 `test/`·`e2e/`·`test-results/` 는 제외. Task 2 Step 4 가 확인.
3. `no-restricted-imports` 예외(`app/_lib/useGuardedRouter.ts`)가 flat config 에서도 살아 있는가 — 죽으면 그 파일이 lint 에러가 난다. Task 2 Step 4 의 0 에러가 확인.
4. `next start` 에서 미들웨어가 Edge 로 실행되고 /me 무쿠키 307 인가(런타임 불변). Task 1 Step 7.
5. `pnpm-lock.yaml` 에 next 16 이 하나만 존재하고 15 잔존이 없는가(전이 의존성 중복). Task 1 Step 3.

---

### Task 1: 의존성·스크립트·설정·문서

**Files:**
- Modify: `frontend/apps/web/package.json` (`next`, `eslint-config-next`, `dev` 스크립트)
- Modify: `frontend/pnpm-lock.yaml` (pnpm install 결과)
- Modify: `frontend/apps/web/next-env.d.ts` (Next 16 이 재생성)
- Modify: `frontend/apps/web/next.config.mjs` (`agentRules: false` 추가 + 187-195행 Sentry webpack 블록 제거)
- Modify: `README.md:11,52`, `AGENTS.md:11`, `CLAUDE.md:11`, `frontend/AGENTS.md:4,13,47`, `frontend/CLAUDE.md:4`, `backend/CLAUDE.md:4` ("Next.js 15" → "Next.js 16")

**Interfaces:**
- Produces: Task 2 는 이 태스크가 설치한 `eslint-config-next@16.3.6` 의 `eslint-config-next/core-web-vitals`·`eslint-config-next/typescript` flat export 를 import 한다.

- [ ] **Step 1: package.json 수정**

`frontend/apps/web/package.json` 에서 세 곳:

```json
    "dev": "next dev",
```
```json
    "next": "^16.3.6",
```
```json
    "eslint-config-next": "^16.3.6",
```
(`lint` 스크립트는 Task 2 에서 바꾼다 — 이 태스크에서는 `next lint` 그대로. **이 커밋 시점엔 Next 16 에 `next lint` 명령이 없어 `pnpm lint` 는 실패한다.** 단일 PR 이라 Task 2 커밋이 즉시 해소하므로 Task 1 검증에서 lint 는 돌리지 않는다.)

- [ ] **Step 2: 설치**

Run (frontend/): `pnpm install --no-frozen-lockfile`
Expected: 종료 0. `grep -E '^  /?(next|eslint-config-next)@' pnpm-lock.yaml` 에 `next@16.3.6:`·`eslint-config-next@16.3.6:` 만 있고 `@15.` 항목 없음.

- [ ] **Step 3: lockfile 잔존 확인**

Run: `grep -cE '^  /?next@15' pnpm-lock.yaml`
Expected: `0`

- [ ] **Step 4a: `agentRules: false` 추가**

`frontend/apps/web/next.config.mjs` 의 `const nextConfig = {` 블록에서 `typedRoutes: true,` 바로 다음 줄에 추가:

```js
  // Next 16 은 AI 코딩 에이전트 환경(Claude Code·Cursor 등)에서 `next dev` 가 이 디렉터리에 AGENTS.md·CLAUDE.md 를
  // 자동 생성한다. 에이전트 지침은 frontend/AGENTS.md·frontend/CLAUDE.md 로 직접 관리하므로 끈다 — 켜 두면
  // apps/web/CLAUDE.md 가 중첩 지침으로 로드되고 untracked 파일 2개가 매번 생긴다.
  agentRules: false,
```

- [ ] **Step 4b: Sentry webpack 블록 제거**

`frontend/apps/web/next.config.mjs` 의 `withSentryConfig(nextConfig, { ... })` 두 번째 인자에서 아래 블록(주석 포함, 187–195행)을 통째로 삭제한다. `bundleSizeOptimizations: { ... },` 뒤에 바로 `});` 가 오게 된다.

```js
  webpack: {
    // 미들웨어 자동 래핑 해제. 켜두면 Sentry 가 middleware.ts 를 wrapMiddlewareWithSentry 로 감싸면서
    // @sentry/core 를 미들웨어 번들에 끌어들이고, 매 요청 isolation scope 복제·요청 헤더 직렬화·span
    // 생성·flush 예약을 돌린다. 미들웨어가 하는 일은 auth_hint 검증 한 번뿐이라 관측 이득 대비
    // Active CPU 비용이 크다. 서버·클라이언트 계측과 소스맵 업로드는 그대로 유지된다.
    // webpack 빌드(`next build`) 전용 옵션이다 — 빌드를 turbopack 으로 옮기면 이 줄은 무효가 된다.
    // (다만 Sentry 는 turbopack 에서 애초에 미들웨어를 감싸지 못하므로 그때도 래핑은 없다.)
    autoInstrumentMiddleware: false,
  },
```

그 자리에 한 줄 주석을 남긴다(`bundleSizeOptimizations` 블록 닫는 `},` 다음 줄):

```js
  // 미들웨어 Sentry 자동 래핑은 끈 상태를 유지한다 — Turbopack 빌드(Next 16 기본)는 미들웨어를 감싸지
  // 않으므로 별도 옵션이 필요 없다(webpack 전용이던 `webpack.autoInstrumentMiddleware: false` 는 제거).
```

- [ ] **Step 5: 문서 표기 갱신**

Run (레포 루트): `grep -rln "Next\.js 15" README.md AGENTS.md CLAUDE.md frontend/AGENTS.md frontend/CLAUDE.md backend/CLAUDE.md | xargs sed -i '' 's/Next\.js 15/Next.js 16/g'`
Expected: `grep -rn "Next\.js 15" README.md AGENTS.md CLAUDE.md frontend backend --include='*.md' | grep -v node_modules | grep -v docs/superpowers` 결과 0줄.

- [ ] **Step 6: 타입체크 + CI 동등 빌드**

Run (frontend/): `pnpm -r typecheck`
Expected: 모든 패키지 Done, 오류 0.

Run (frontend/): `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes NEXT_TELEMETRY_DISABLED=1 pnpm --filter @duing/web build > /tmp/next16-build.log 2>&1; echo "exit=$?"; tail -8 /tmp/next16-build.log`
Expected: `exit=0`, 로그에 `▲ Next.js 16.3.6 (Turbopack)`, `✓ Compiled successfully`, `ƒ Proxy (Middleware)`.
Run: `grep -nE "⚠|warn|webpack" /tmp/next16-build.log`
Expected: `⚠ The "middleware" file convention is deprecated` 블록(3~4줄)만 있고 그 외 경고·`webpack` 언급 0.

- [ ] **Step 7: next-env.d.ts 확인 + start 스모크**

Run: `git status --short apps/web/next-env.d.ts`
Expected: ` M apps/web/next-env.d.ts` (Next 16 재생성본 — 커밋 대상).

Run (frontend/apps/web/): `AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes pnpm exec next start -p 3107 &` 후 `sleep 5; curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" localhost:3107/me; curl -s -o /dev/null -w "%{http_code}\n" localhost:3107/clubs; pkill -f "next start -p 3107"`
Expected: `307 -> http://localhost:3107/login?next=%2Fme` 그리고 `200`.

Run: `ls .next/server/edge/chunks | head -3`
Expected: 파일 목록이 나온다(미들웨어가 Edge 번들로 빌드됨 = 런타임 불변).

- [ ] **Step 7b: dev 서버가 에이전트 파일을 만들지 않는지 확인**

Run (frontend/apps/web/): `(NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes pnpm exec next dev -p 3109 > /tmp/next16-dev.log 2>&1 &); sleep 10; curl -s -o /dev/null -w "%{http_code}\n" localhost:3109/403; pkill -f "next dev -p 3109"; sleep 1; git status --short . | grep -E "AGENTS.md|CLAUDE.md"; echo "agent-files=$?"`
Expected: `200` 그리고 `agent-files=1`(grep 무매치 = 생성된 파일 없음). `/tmp/next16-dev.log` 에 `agent` 관련 생성 로그 없음. 1 이 아니면 `agentRules: false` 가 적용되지 않은 것 — 파일을 삭제하고 Step 4a 를 다시 본다.

- [ ] **Step 8: 전체 테스트**

Run (frontend/): `pnpm --filter @duing/web test -- --run 2>&1 | tail -6`
Expected: `Test Files  373 passed (373)`, `Tests  3224 passed (3224)` (파일·테스트 수는 develop 시점 기준, ±0).

- [ ] **Step 9: 커밋**

```bash
git add frontend/apps/web/package.json frontend/pnpm-lock.yaml frontend/apps/web/next-env.d.ts frontend/apps/web/next.config.mjs README.md AGENTS.md CLAUDE.md frontend/AGENTS.md frontend/CLAUDE.md backend/CLAUDE.md
git commit -m "chore(frontend): Next 16.3.6 업그레이드 — Turbopack 기본 빌드, agentRules off, dev 플래그·Sentry webpack 옵션 제거, 문서 표기 갱신"
```

---

### Task 2: ESLint flat config 전환

**Files:**
- Create: `frontend/apps/web/eslint.config.mjs`
- Delete: `frontend/apps/web/.eslintrc.json`
- Modify: `frontend/apps/web/package.json` (`lint` 스크립트)
- Modify: `frontend/apps/web/postcss.config.mjs` (익명 default export 에 이름)

**Interfaces:**
- Consumes: Task 1 이 설치한 `eslint-config-next@16.3.6`.
- Produces: `pnpm lint`(루트 `pnpm -r lint` → web 의 `eslint .`) 가 CI `frontend-ci.yml` Lint 스텝에서 그대로 돈다(워크플로 수정 없음).

- [ ] **Step 1: lint 스크립트 교체**

`frontend/apps/web/package.json`:
```json
    "lint": "eslint .",
```

- [ ] **Step 2: flat config 작성, 레거시 삭제**

`frontend/apps/web/eslint.config.mjs` 를 아래 내용으로 생성한다. 규칙 본문은 `.eslintrc.json` 의 것을 그대로 옮긴 것이다(메시지 문자열 변경 금지).

```js
import { defineConfig } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  {
    // 검사 범위: app·components + 루트 설정·계측 파일(instrumentation*.ts·middleware.ts·*.config.*·sentry*.ts).
    // test/·e2e/ 는 `next lint` 시절에도 린트 대상이 아니었고, 포함하면 그쪽 경고·에러 40여 건이 섞인다.
    // 루트 파일은 일부러 제외하지 않는다(설정 파일 실수도 잡는다).
    ignores: ['test/**', 'e2e/**', 'test-results/**', '.next/**', 'next-env.d.ts'],
  },
  {
    extends: [...nextCoreWebVitals, ...nextTypescript],
    linterOptions: {
      // `next lint` 파리티 — 미사용 eslint-disable 주석을 경고로 보고하지 않는다.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // eslint-plugin-react-hooks 7 이 React Compiler 를 전제로 추가한 규칙. 이 프로젝트는 컴파일러를 쓰지
      // 않으므로 전제가 성립하지 않는다(refs 90여·set-state-in-effect 45 등 실측). 컴파일러 도입 시 재검토.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      // `_` 접두 인자는 의도된 미사용(exhaustive check `((_: never) => {})(x)` 등). `next lint` 15 에서는
      // 경고가 아니었고, 16 의 typescript 프리셋만 두면 ApplicantInterviewScheduleCard.tsx:231 이 경고로 뜬다.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
]);
```

그리고 `git rm frontend/apps/web/.eslintrc.json`.

⚠ 작성 전 `.eslintrc.json` 을 읽어 `no-restricted-imports.paths` 항목 수(3개)와 `overrides`(useGuardedRouter 예외) 가 위와 일치하는지 대조한다. 다르면 `.eslintrc.json` 쪽이 진실이다.

- [ ] **Step 3: postcss 설정 익명 export 해소**

`frontend/apps/web/postcss.config.mjs` 전체를:
```js
const postcssConfig = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default postcssConfig;
```

- [ ] **Step 4: lint 실행**

Run (frontend/): `pnpm lint > /tmp/next16-lint.log 2>&1; echo "exit=$?"; tail -5 /tmp/next16-lint.log`
(zsh 에서는 `${PIPESTATUS[0]}` 가 빈 문자열이라 파이프로 잡으면 거짓 통과한다 — 반드시 위 형태로.)
Expected: `exit=0`, `✖ 1 problem (0 errors, 1 warning)` — 남은 1건은 `app/notifications/page.tsx` exhaustive-deps(기존, 이번 범위 밖). `ApplicantInterviewScheduleCard.tsx` 의 `_` never 인자 경고는 위 `argsIgnorePattern` 으로 사라져야 하며, 남아 있으면 규칙 설정을 다시 본다(코드를 고치지 말 것 — 그 `_` 는 union 누락 감지용 exhaustive check 다).

검사 범위 확인 Run (frontend/apps/web/): `pnpm exec eslint --debug . 2>&1 | grep -E "Linting code for" | grep -cE "/(test|e2e)/"`
Expected: `0` (test/·e2e/ 미검사). 그리고 `pnpm exec eslint components/ instrumentation-client.ts middleware.ts next.config.mjs; echo exit=$?` → `exit=0` (범위 안에 있고 에러 없음).

- [ ] **Step 5: 타입체크·테스트 재확인**

Run (frontend/): `pnpm -r typecheck && pnpm --filter @duing/web test -- --run 2>&1 | tail -4`
Expected: typecheck 오류 0, `Test Files  373 passed`, `Tests  3224 passed`.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/eslint.config.mjs frontend/apps/web/package.json frontend/apps/web/postcss.config.mjs
git rm -q frontend/apps/web/.eslintrc.json
git commit -m "chore(frontend): next lint 제거 대응 — ESLint flat config 전환, react-hooks 7 컴파일러 규칙 off, 검사 범위 파리티"
```

---

## 완료 후 (컨트롤러)
1. whole-branch 리뷰(fork) — 관점: 런타임 불변(middleware Edge 유지), lint 범위 파리티, 죽은 설정 잔존, 문서 누락.
2. PR self-check 7항목 → push → `gh pr create`(머지 금지). 제목: `chore(frontend): Next 16.3.6 업그레이드 — Turbopack 기본 빌드·ESLint flat config 전환, middleware 는 Edge 유지`.
3. 프리뷰 배포에서 스펙 "배포 후 확인" 3항목.
