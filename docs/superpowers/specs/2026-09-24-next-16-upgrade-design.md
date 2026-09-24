# Next.js 16 업그레이드 — 설계 스펙 (2026-09-24)

## 배경
- 2026-09-24 Next 15.5.26 보안 패치(#1271)가 prod(main 8d9dbcf46)에 배포됐고 `pnpm audit --prod` 는 0건이다. 보안 압박 없이 메이저 업그레이드를 일반 PR 로 처리할 수 있는 상태.
- 사전 시험(origin/develop 기준 임시 워크트리, 2026-09-24): next·eslint-config-next 만 ^16.3.6 으로 올린 상태에서 typecheck 통과, `next build`(Turbopack 기본) 성공·경고 0, vitest 373 파일/3224 통과, `next start` 로 /me 무쿠키 307 → /login 확인. 코드 수정 0.
- 사전 점검 결과 Next 16 breaking 항목 중 이 레포에 해당하는 것은 **`next lint` 제거** 하나뿐이다. 동기 params 0건(Promise 39), 병렬 슬롯·`unstable_`·`revalidateTag`·`serverRuntimeConfig`·`next/legacy/image`·AMP 0건, `next/dynamic` `ssr:false` 는 'use client' 파일 안, `images.qualities`/`minimumCacheTTL` 이미 명시, `experimental.staleTimes` 는 16 에서도 experimental 로 그대로 지원, `scroll-behavior` 미사용, `process.argv` 검사 없음.
- 환경: Vercel 프로젝트 Node 24.x(MCP 조회), CI Node 20(≥20.9 충족). `@sentry/nextjs` 10.58.0 의 peer 가 `^16.0.0-0` 을 포함해 Sentry 11 전환 불필요.

## 목표
Next 16.3.6 으로 올리되 **런타임 동작은 15 와 동일**하게 유지한다. 바뀌는 것은 빌드 도구(Turbopack)와 린트 실행 방식뿐이다.

## 범위 (In Scope)
1. `frontend/apps/web/package.json`: `next` ^16.3.6, `eslint-config-next` ^16.3.6. `dev` 스크립트의 `--turbopack` 플래그 제거(16 기본값). `lint` 스크립트 `next lint` → `eslint .`.
2. `next-env.d.ts`: Next 16 이 재생성하는 내용 그대로 커밋(추적 파일).
3. ESLint flat config 전환: `.eslintrc.json` 삭제, `eslint.config.mjs` 신설. 규칙 내용(no-restricted-globals/properties/imports, `useGuardedRouter` 예외)은 그대로 이식.
   - **검사 범위 = app·components + 루트 설정·계측 파일(`instrumentation*.ts`·`middleware.ts`·`*.config.*`·`sentry*.ts`), test/·e2e/·test-results/ 제외.** `next lint` 기본 범위(app·components)보다 루트 파일만큼 넓고, `eslint .` 기본보다 test/·e2e/ 만큼 좁다. 루트 파일은 ignores 에 넣지 않는다. 근거: 시험에서 test/ 만으로 no-html-link-for-pages 31·no-unused-vars 12 등이 추가로 나왔고 이는 이번 PR 의 목적(업그레이드)이 아니다.
   - **eslint-plugin-react-hooks 7 의 React Compiler 전제 규칙 5종 off**: `react-hooks/refs`(92)·`set-state-in-effect`(45)·`incompatible-library`(6)·`purity`(1)·`static-components`(1). 이 프로젝트는 React Compiler 를 쓰지 않으므로 규칙의 전제가 성립하지 않는다. 도입 시 재검토한다는 주석을 남긴다.
   - `linterOptions.reportUnusedDisableDirectives: 'off'` — `next lint` 는 미사용 disable 주석을 보고하지 않았다(파리티). 시험에서 7건이 경고로 떴다.
   - 결과 기준: `pnpm lint` 종료코드 0, 에러 0, 경고는 기존 1건(`app/notifications/page.tsx` exhaustive-deps)만. 16 프리셋에서 새로 뜨는 `ApplicantInterviewScheduleCard.tsx:231` 의 `_` never 인자(exhaustive check, 의도된 미사용) 경고는 `@typescript-eslint/no-unused-vars` 에 `argsIgnorePattern: '^_'` 를 줘 규칙 쪽에서 해소한다(코드 수정 없음). `postcss.config.mjs` 익명 default export 경고는 이름을 붙여 해소.
4. `next.config.mjs`: (a) `agentRules: false` 추가 — Next 16 은 AI 코딩 에이전트 환경에서 `next dev` 가 `apps/web/AGENTS.md`·`CLAUDE.md` 를 자동 생성한다(`ensureAgentRulesForDev`). 이 레포는 `frontend/AGENTS.md`·`frontend/CLAUDE.md` 를 직접 관리하므로 중첩 파일이 생기면 안 된다. (b) Sentry `webpack.autoInstrumentMiddleware: false` 블록 제거. Turbopack 빌드에서는 무효이고 Sentry 는 Turbopack 에서 미들웨어를 애초에 감싸지 않는다(기존 주석이 이미 그렇게 적고 있음). 죽은 설정을 남기면 3am 에 오독한다.
5. 문서: README.md·AGENTS.md·CLAUDE.md·frontend/AGENTS.md·frontend/CLAUDE.md·backend/CLAUDE.md 의 "Next.js 15" 표기를 16 으로.

## 결정: middleware.ts 는 이번 PR 에서 유지한다 (proxy.ts 리네임은 후속)
- Next 16 에서 `middleware` 파일 규약은 **deprecated 이지만 지원**되며 빌드·dev 에 경고 1줄이 뜬다(시험으로 확인: 빌드 성공, Edge 번들 `server/edge/chunks/*` 유지, /me 307 정상). 공식 가이드: "If you want to continue using the edge runtime, keep using middleware."
- `proxy.ts` 로 바꾸면 런타임이 **Node 로 고정**되고(설정 불가), Vercel 에서는 별도 Node 서버리스 함수로 실행된다(시험: `server/middleware.js` + nft 로 산출). 이 경우 Next 16.3 부터 `instrumentation.ts` `register()` 가 그 함수에서도 실행되어(Next PR 95357) `NEXT_RUNTIME === 'nodejs'` 분기로 **Sentry 서버 init 이 proxy 함수 부팅마다 돌게 된다** — 현재 코드가 Active CPU 를 이유로 의도적으로 피해 온 비용이다(instrumentation.ts 주석). 미들웨어는 Active CPU 의 16.7% 였다.
- 따라서 메이저 업그레이드(빌드 도구 교체)와 런타임 이전(Edge→Node)을 한 PR 에 섞지 않는다. 후속 PR 은 "proxy(Node)로 간다"로 못박지 않고, Next 가 예고한 edge 런타임 후속 지침("We will follow up on a minor release with further edge runtime instructions")을 그 시점에 확인한 뒤 Sentry init 게이팅·Active CPU 실측과 함께 결정한다.

## 검증 기준
- `pnpm -r typecheck`, `pnpm lint`(0 에러), `pnpm --filter @duing/web test -- --run`(전체 스위트), CI 동등 빌드 `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes pnpm --filter @duing/web build` 모두 성공.
- `next start` 스모크: 무쿠키 `/me` → 307 `/login?next=%2Fme`, `/clubs` → 200.
- 빌드 로그에 middleware deprecation 경고 1건 외 경고 0.
- `pnpm dev` 를 AI 에이전트 환경에서 잠깐 띄운 뒤 `git status --short` 에 `apps/web/AGENTS.md`·`apps/web/CLAUDE.md` 가 생기지 않음(`agentRules: false` 확인).

## 배포 후 확인(프리뷰/prod — 코드로 못 잡는 항목)
1. `next-view-transitions` 0.3.5 — 2025-11 이후 릴리스 없음, 미해결 이슈 #65(Next 16.2 + 0.3.5 에서 "router state header could not be parsed", 2건·영향 0). 프리뷰에서 페이지 전환 QA 후 Sentry 에 해당 메시지가 뜨는지 감시. 재현되면 React 19.2 `<ViewTransition>` 로 교체하는 별도 PR.
2. Turbopack 빌드의 Sentry 소스맵 업로드 — 첫 프리뷰 배포의 Sentry 릴리스 아티팩트 확인.
3. Next 16 라우터(레이아웃 중복 제거 프리페치) — 홈·탐색에서 프리페치 요청 수 증가/총량 감소 확인(성능 회귀 아님).

## Out of Scope
- `middleware.ts → proxy.ts` 리네임(위 결정, 후속 PR).
- Cache Components / `cacheComponents` / PPR / React Compiler(`reactCompiler`) 도입.
- `@sentry/nextjs` 11 메이저 전환.
- test/·e2e/ 를 린트 범위에 넣는 것(기존에도 미포함) 및 거기서 나온 경고·에러 정리.
- react-hooks 7 규칙이 가리키는 코드 수정(refs 92건 등) — 규칙 자체를 끄므로 다루지 않음.
- `next-view-transitions` 교체 — 프리뷰 QA 결과에 따라 별도.
- `--turbopack` 외 빌드 옵션 튜닝(filesystem cache 등), 번들 크기·Active CPU 재측정(배포 후 별도).
- CI Node 버전 변경(20 은 요건 충족).
