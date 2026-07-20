# AGENTS.md — du-ing-fe

대구대학교 동아리 통합 플랫폼 **Du-ing(두잉)** 프론트엔드.
Next.js 15 + React 19 (App Router) 기반, pnpm workspaces 모노레포.
RN 호환을 위해 비즈니스 로직은 `packages/*` 로 분리되어 있으며, 추후 `apps/mobile`(Expo) 추가 시 그대로 재사용한다.

---

## 기술 스택

| 영역 | 선택 |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| 언어 | TypeScript 5 |
| 빌드 / 패키지 | pnpm 9 workspaces |
| 서버 상태 | TanStack Query 5 |
| 클라이언트 상태 | Zustand 5 |
| 스타일 | Tailwind CSS (shadcn-ui 도입 예정) |
| HTTP | ky |
| 폼 / 검증 | React Hook Form + Zod |
| 테스트 | Vitest + Playwright (도입 예정) |

---

## Common Commands

모든 명령은 `frontend/` 디렉터리에서 실행한다.

```bash
pnpm install      # 의존성 설치 (최초 1회 + lock 변경 시)
pnpm dev          # @duing/web 개발 서버 (http://localhost:3000)
pnpm build        # 모든 워크스페이스 빌드
pnpm lint         # 모든 워크스페이스 lint
pnpm typecheck    # 모든 워크스페이스 tsc --noEmit
pnpm test         # 모든 워크스페이스 test
pnpm gen:api      # 백엔드 /v3/api-docs → packages/api 의 TS 타입 자동 생성 (백엔드 부팅 필요)
```

---

## 프로젝트 구조

```
frontend/
├── apps/
│   └── web/                          # Next.js 15 앱
│       ├── app/                      # App Router (src/ 없이 루트 위치)
│       │   ├── (main)/
│       │   │   ├── _components/
│       │   │   ├── _containers/
│       │   │   ├── _hooks/
│       │   │   ├── _pages/
│       │   │   └── page.tsx
│       │   ├── club/
│       │   ├── recruitment/
│       │   ├── apply/
│       │   ├── _api/                 # apps/web 전용 API 래퍼 (선택)
│       │   ├── _actions/             # Server Actions
│       │   ├── providers.tsx
│       │   └── layout.tsx
│       ├── components/               # 앱 전역 공용 UI (Header, Footer 등)
│       └── utils/                    # 앱 전역 유틸 (cn 등)
└── packages/                         # RN 공유 가능한 비즈니스 로직
    ├── types/                        # 백엔드 도메인 타입
    ├── api/                          # ky 기반 DuingApiClient
    ├── schemas/                      # Zod 스키마 (백엔드 검증 미러)
    ├── hooks/                        # TanStack Query 훅 (useXxxQuery)
    ├── stores/                       # Zustand 스토어 (auth 등)
    └── storage/                      # 플랫폼 추상화 (web/native)
```

### 위치 결정 원칙

| 무엇 | 위치 | 이유 |
|---|---|---|
| 백엔드 도메인 타입 | `packages/types/` | RN 공유 |
| HTTP 호출 메서드 | `packages/api/` (`DuingApiClient`) | 단일 진실원, RN 공유 |
| Zod 스키마 | `packages/schemas/` | 폼 검증, RN 공유 |
| 전역 React Query 훅 | `packages/hooks/` | RN 공유 |
| 전역 Zustand 스토어 | `packages/stores/` | RN 공유 |
| 라우트 한 곳 전용 (컴포넌트/훅/유틸) | `apps/web/app/[route]/_*/` | route-local |
| 앱 전역(2곳 이상) 공용 UI | `apps/web/components/` | web 전용 UI |

**라우트 내부 구조** (route-local):

```
[route]/
├── _components/     # 해당 라우트 전용 컴포넌트
├── _containers/     # 데이터 패칭 + UI 조립
├── _hooks/          # 해당 라우트 전용 훅
├── _pages/          # Client Page 컴포넌트
├── _utils/
├── _constants/
└── page.tsx
```

---

## 컴포넌트 패턴

### Page (Server Component → Client Page 조립)

```tsx
// apps/web/app/club/page.tsx
import { ClubListPage } from './_pages/ClubListPage';

export default function Page() {
  return <ClubListPage />;
}

// apps/web/app/club/_pages/ClubListPage.tsx
'use client';
import { ClubListContainer } from '../_containers/ClubListContainer';

export function ClubListPage() {
  return <ClubListContainer />;
}
```

### 일반 컴포넌트 규칙
- Props 타입 이름: 단일 props 면 `Props`, 같은 파일에 여러 개면 `{ComponentName}Props`
- 컴포넌트는 `function` 키워드 (화살표 함수 금지)
- 일반 함수는 화살표 함수
- 변수는 `camelCase`, 타입은 `PascalCase`
- 조건부 `className` 은 `cn()` 유틸 사용 (`clsx` + `tailwind-merge`)

```tsx
'use client';
import { cn } from '@/utils/cn';

type Props = {
  clubName: string;
  memberCount: number;
  isRecruiting?: boolean;
};

export function ClubCard({ clubName, memberCount, isRecruiting = false }: Props) {
  return (
    <div className={cn('rounded-lg border p-4', isRecruiting && 'border-blue-500')}>
      <h3 className="text-lg font-semibold">{clubName}</h3>
      <p className="text-sm text-gray-600">{memberCount}명</p>
    </div>
  );
}
```

---

## TanStack Query 패턴

### Query Key 관리
도메인별 `queryKeys` 객체로 묶고 문자열 키 직접 사용 금지.

```ts
// packages/hooks/src/clubQueryKeys.ts
import type { ClubSearchParams } from '@duing/types';

export const clubQueryKeys = {
  all: ['club'] as const,
  list: (params: ClubSearchParams) => [...clubQueryKeys.all, 'list', params] as const,
  detail: (clubId: number) => [...clubQueryKeys.all, 'detail', clubId] as const,
};
```

### 훅 네이밍
- 조회: `use{Domain}{Action}Query` (예: `useClubListQuery`)
- 변경: `use{Domain}{Action}Mutation` (예: `useApplyClubMutation`)
- 훅은 `@duing/api` 의 메서드를 호출 (HTTP 직접 호출 금지)

```ts
export function useClubListQuery(params: ClubSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
  });
}
```

### Invalidate
Mutation 의 `onSuccess` 에서 관련 key 무효화. 광범위한 `all` 보다 `list`/`detail` 우선.

---

## Zustand 패턴

- 전역 상태만 (예: 로그인 사용자) — **서버 상태는 절대 금지**(TanStack Query 가 진실원)
- 한 도메인 = 한 스토어 = 한 파일 (`packages/stores/src/{domain}-store.ts`)
- 액션은 스토어 내부에 정의 (`setState` 외부 직접 호출 금지)

```ts
// packages/stores/src/auth-store.ts
type AuthState = {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));
```

---

## API 레이어

- HTTP 호출은 **`packages/api/` 의 `DuingApiClient` 만 사용** — `ky`/`fetch` 직접 호출 금지
- API 메서드명은 동사 시작 (`list`, `detail`, `create`, `submit`, `updateStatus`)
- 백엔드 변경 흐름: ① `packages/types/` 갱신(또는 `pnpm gen:api`) → ② `packages/api/src/client.ts` 메서드 추가/수정 → ③ `packages/hooks/` 훅 갱신

---

## 코드 컨벤션

### Import 순서 (그룹 사이 빈 줄)
1. external (`react`, `next`, 외부 라이브러리)
2. 워크스페이스 (`@duing/*`)
3. internal absolute (`@/...`)
4. parent (`../...`)
5. sibling (`./...`)
6. type imports (`import type { ... }`)

### 기타
- `'use client'` 는 파일 최상단, import 위
- 타입 선언은 `type` (`interface` 금지, 라이브러리 augmentation 예외)
- Conventional Commits: `<type>(<scope>): <description>` (commitlint 도입 시 강제)

### 날짜/시간 표시 (상세: [/TIMEZONE.md](../TIMEZONE.md))
- 시각 표시는 `@duing/hooks` 공통 유틸만: `formatDateTimeKst`/`formatDateKst`/`formatTimeKst`/`formatRelativeTime` (+ 특수 포맷 `kstDateTimeFormatter`, KST 날짜 연산 `kstDateString`/`isTodayKst`/`daysUntilKst`)
- 금지: timeZone 없는 `toLocaleString()`류, 시각 문자열 `slice()`, `getHours()` 등 로컬 게터, 화면별 지역 포맷 함수 — Event 필드는 `…Z`(UTC)라 slice 시 UTC 숫자가 노출됨
- 백엔드 계약: Event Time은 `…Z` 절대시각, Schedule Time(행사·면접·모집)은 오프셋 없는 KST 벽시계 — 공통 유틸이 둘 다 자동 처리

---

## 테스트

- 코드 작성 후 `pnpm test` 로 검증
- 성공 / 실패 / 엣지 케이스 모두 다룬다 — 실패는 백엔드 Swagger 에러 응답 기반
- 테스트 설명은 무엇을 검증하는지 명확하게 (과도한 추상화 금지)
- 타입 단언(`as`) 금지

### 모킹
- API 응답만 모킹 (TanStack Query 자체 mock 금지)
- 공용 `render` 유틸 사용 (`QueryClientProvider` + `ApiClientProvider` 포함)

### 폴더 구조

```
apps/web/test/
└── [페이지명]/
    ├── [페이지명].test.tsx
    ├── [훅이름].test.tsx
    ├── components/[컴포넌트].test.tsx
    └── [페이지명].data.ts          # Mock 데이터 (페이지 내 여러 번 사용 시)
```

여러 페이지에서 공유될 때만 `test/shared/[domain]Mock.ts` 로 추출.

---

## React Native 호환 원칙

| 카테고리 | RN 공유 | web/mobile 분리 |
|---|---|---|
| 타입 / API / Zod / Query 훅 / Zustand | `packages/*` ✅ | — |
| Storage | `@duing/storage` 인터페이스 ✅ | `webStorage` / `nativeStorage` 구현체 |
| UI 컴포넌트 | ❌ | Tailwind+shadcn (web) / RN Components (mobile) |
| 라우팅 | ❌ | Next App Router (web) / Expo Router (mobile) |

`packages/*` 코드에는 DOM API(`window`, `document`) / RN 전용 API 직접 import 금지.
플랫폼 분기는 **인터페이스 + 구현체 주입 패턴**(`@duing/storage` 처럼) 사용.
