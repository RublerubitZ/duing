# Du-ing Frontend

pnpm workspaces 모노레포. **Next.js 14 (App Router) + React 18 + TypeScript** 기반. RN(Expo) 호환을 위해 비즈니스 로직은 별도 패키지로 분리.

## 구조

```
frontend/
├── apps/
│   └── web/                  # Next.js 14 (App Router, Tailwind)
├── packages/
│   ├── types/                # 백엔드 도메인 타입 (User, Club, Recruitment, Application + ApiResponse/PageResponse)
│   ├── api/                  # ky 기반 API 클라이언트. JWT 자동 부착. ApiError 변환.
│   ├── schemas/              # Zod 스키마 (백엔드 @Valid 규칙 미러)
│   ├── stores/               # Zustand 스토어 (auth)
│   ├── hooks/                # TanStack Query 훅 (useLogin, useClubList, ...)
│   └── storage/              # 플랫폼 추상화 storage (web=localStorage, native=AsyncStorage)
├── package.json              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .prettierrc.json
└── .env.example
```

> 모든 명령어는 `frontend/` 디렉터리에서 실행한다.

## 사전 설치

```bash
brew install node          # Node 20 LTS
brew install pnpm          # 9.x
# 또는 corepack 사용: corepack enable && corepack prepare pnpm@9 --activate
```

## 빠른 시작

```bash
cd frontend
pnpm install                                    # 모든 워크스페이스 의존성 설치
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev                                        # http://localhost:3000
```

백엔드(`backend/`)는 별도 터미널에서 `./gradlew bootRun` 으로 띄워둔다 (`http://localhost:8080`).

## 주요 스크립트 (root)

| 명령 | 동작 |
|---|---|
| `pnpm dev` | web 앱 개발 서버 |
| `pnpm build` | 모든 워크스페이스 build (web 마지막) |
| `pnpm lint` | 모든 워크스페이스 lint |
| `pnpm typecheck` | 모든 워크스페이스 `tsc --noEmit` |
| `pnpm test` | 모든 워크스페이스 test |
| `pnpm gen:api` | 백엔드 부팅 상태에서 `/v3/api-docs` → `packages/api/src/generated/schema.d.ts` 생성 |

## RN 호환 원칙

| 카테고리 | 공유 가능 (RN 그대로) | 공유 불가 (플랫폼별) |
|---|---|---|
| 타입 | `@duing/types` | — |
| API 호출 | `@duing/api` (ky/fetch) | — |
| 검증 | `@duing/schemas` (Zod) | — |
| 서버 상태 | `@duing/hooks` (TanStack Query) | — |
| 클라이언트 상태 | `@duing/stores` (Zustand) | — |
| Storage | `@duing/storage` 인터페이스 | `webStorage` (localStorage) / `nativeStorage` (AsyncStorage) |
| UI | — | Tailwind+shadcn (web), React Native View/Text (mobile) |
| 라우팅 | — | Next App Router (web), Expo Router (mobile) |

**원칙**:
- 공유 패키지에는 DOM API(`window`, `document`)나 React Native 전용 API 를 직접 import 하지 않는다.
- 플랫폼 분기가 필요한 경우 `storage` 처럼 **인터페이스 + 구현체** 패턴으로 추상화.
- UI 컴포넌트는 처음부터 공유하지 말고, 비즈니스 로직만 공유. (mobile 앱 추가 시 RN 컴포넌트는 별도 작성)

## mobile 앱 추가 시 (가이드)

```bash
# Expo 앱 생성 (예시)
pnpm dlx create-expo-app apps/mobile --template
# 후 apps/mobile/package.json 에 workspace deps 추가:
#   "@duing/api": "workspace:*"
#   "@duing/hooks": "workspace:*"
#   "@duing/stores": "workspace:*"
#   ...
# 그리고 진입점에서:
#   import { setStorage } from '@duing/storage';
#   import { nativeStorage } from '@duing/storage/native';
#   setStorage(nativeStorage);
```

## 환경변수

- `apps/web/.env.local` (커밋 금지) — 템플릿: `apps/web/.env.local.example`
- `NEXT_PUBLIC_*` 접두사가 붙은 변수만 브라우저에 노출됨.

## 다음 작업 후보

- [ ] 로그인/회원가입 페이지 (`app/(auth)/login`, `signup`)
- [ ] 동아리 목록 페이지 (`app/clubs`)
- [ ] 동아리 상세 페이지 (`app/clubs/[clubId]`)
- [ ] 모집 달력 페이지 (`app/recruitments`)
- [ ] 지원 폼 페이지 (`app/recruitments/[id]/apply`)
- [ ] shadcn-ui 도입 및 공통 UI 컴포넌트
- [ ] Vitest + Playwright 테스트 셋업
- [ ] OpenAPI → TS 타입 자동 생성 파이프라인 활성화 (`pnpm gen:api`)
