# CLAUDE.md — du-ing-fe

프로젝트 개요, 구조, 명령어, 핵심 패턴은 @AGENTS.md(미작성, 추후 추가) 또는 [`README.md`](./README.md) 참조.
모노레포 구조: `backend/` (Spring Boot 3.4 / Java 21), `frontend/` (Next.js 15 + React 19, pnpm workspaces).
백엔드 작업 규칙은 [`../backend/AGENTS.md`](../backend/AGENTS.md), 루트 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md) 참조.

---

## 기술 스택

- **Framework**: Next.js 15 (App Router) + React 19
- **언어**: TypeScript 5
- **빌드 / 패키지**: pnpm 9 workspaces (모노레포)
- **상태 관리**: TanStack Query (서버 상태) + Zustand (클라이언트 상태)
- **스타일링**: Tailwind CSS
- **HTTP Client**: ky
- **폼 / 검증**: React Hook Form + Zod
- **UI 라이브러리**: 추후 결정 (shadcn-ui 도입 시 본 문서 갱신)
- **테스트**: Vitest + Playwright (도입 예정)

---

## 모노레포 구조

```
frontend/
├── apps/
│   └── web/                          # Next.js 15 앱
│       ├── app/                      # App Router (src/ 없이 루트에 위치)
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
│       ├── components/               # 앱 전역 공용 컴포넌트 (Header, Footer 등)
│       └── utils/                    # 앱 전역 유틸 (cn 등)
└── packages/                         # 모노레포 공유 패키지 (RN 호환 — 추후 apps/mobile 에서 그대로 재사용)
    ├── types/                        # 백엔드 도메인 타입 (User/Club/ClubMember/Recruitment/Application + ApiResponse/PageResponse)
    ├── api/                          # ky 기반 DuingApiClient (JWT 자동 부착, ApiError 변환)
    ├── schemas/                      # Zod 스키마 (백엔드 @Valid 한국어 메시지 미러)
    ├── hooks/                        # TanStack Query 훅 (useClubListQuery 등)
    ├── stores/                       # Zustand 스토어 (auth 등)
    └── storage/                      # 플랫폼 추상화 storage (web/native)
```

### 위치 결정 원칙

| 무엇 | 어디에 | 이유 |
|---|---|---|
| 백엔드 응답·요청 타입 | `packages/types/` | RN(apps/mobile) 에서도 그대로 사용 |
| HTTP 호출 (도메인 메서드) | `packages/api/src/client.ts` (`DuingApiClient`) | 단일 진실원, RN 공유 |
| Zod 스키마 (백엔드 검증 미러) | `packages/schemas/` | 폼 검증 + RN 공유 |
| 전역 React Query 훅 (`useClubListQuery` 등) | `packages/hooks/` | RN 공유 |
| 전역 Zustand 스토어 (auth 등) | `packages/stores/` | RN 공유 |
| 라우트 한 곳에서만 쓰는 컴포넌트/훅/유틸 | `apps/web/app/[route]/_*/` | route-local |
| 앱 전역(2곳 이상) 공용 컴포넌트 | `apps/web/components/` | web 전용 UI |

**한 라우트에서만 쓰이는 것**은 해당 라우트의 `_xxx/`에, **두 곳 이상**에서 쓰이면 `apps/web/` 전역(또는 RN 공유 대상이면 `packages/*`)으로 승격한다.

---

## Common Commands

```bash
# 모든 명령은 frontend/ 디렉터리에서 실행

# 의존성 설치 (최초 1회 + 락파일 변경 시)
pnpm install

# 개발 서버
pnpm dev                      # @duing/web 만 실행

# 프로덕션 빌드
pnpm build

# Lint / Typecheck / Test
pnpm lint
pnpm typecheck
pnpm test

# 백엔드 OpenAPI → TS 타입 자동 생성 (백엔드 부팅 상태 필요)
pnpm gen:api
```

---

## Claude 작업 규칙

### 시작 전
- 요청이 모호하면 먼저 질문한다
- 수정할 파일은 반드시 읽고 기존 패턴(폴더 구조, 네이밍, import 순서)을 파악한 뒤 작업한다
- 솔루션 로직을 스스로 검토한 후 제시한다

### 코드 작성
- 기존 프로젝트 스타일과 App Router 구조를 엄격히 따른다
- 요청된 작업 범위만 수정한다 (불필요한 리팩토링 금지)
- 완전히 실행 가능한 코드만 제공한다 (의사코드 금지)
- secrets/환경변수 하드코딩 절대 금지 — `apps/web/.env.local` + `process.env`로 주입
- **변수명은 역할이 드러나도록 작성**한다 — `data`, `res`, `e` 같은 모호한 축약 금지
  - 나쁜 예: `const data = useQuery(...)`, `const res = await api.post(...)`
  - 좋은 예: `const { data: clubList } = useClubListQuery(...)`, `const createResponse = await api.post(...)`
- **`any` 사용 금지** — 불가피한 경우 `unknown` 후 타입 가드
- **`as` 타입 단언 금지** (zod parse / 가드 함수 사용)

### 새 기능(페이지) 추가 시 필수 순서
1. `packages/types/src/`에 도메인 타입이 누락됐다면 추가
2. `packages/api/src/client.ts`(또는 도메인 파일)에 API 메서드 추가 (백엔드와 1:1 매칭)
3. `packages/hooks/src/`에 React Query 훅 추가 (`use{Domain}{Action}Query` / `use{Domain}{Action}Mutation`)
4. `apps/web/app/[route]/_components/` 또는 `_containers/`에 UI 컴포넌트 구현
5. `apps/web/app/[route]/_pages/`에 Client Page 컴포넌트 조립 또는 `page.tsx`에 Server Component 작성
6. 테스트 작성

> 라우트별로만 쓰이는 API/훅/타입은 `apps/web/app/[route]/_api/`, `_hooks/`에 두는 것도 허용된다. 단, 두 라우트 이상에서 쓰이는 순간 `packages/*` 로 승격.

---

## 컴포넌트 패턴

### Page (Server Component)
```tsx
// apps/web/app/club/page.tsx
import { ClubListPage } from './_pages/ClubListPage';

export default function Page() {
  return <ClubListPage />;
}
```

### Page (Client Component)
```tsx
// apps/web/app/club/_pages/ClubListPage.tsx
'use client';

import { ClubListContainer } from '../_containers/ClubListContainer';

export function ClubListPage() {
  return <ClubListContainer />;
}
```

### 일반 컴포넌트 규칙
- Props 타입 이름: 단일 props 타입이면 `Props`, 같은 파일/도메인에 여러 props 타입이 있으면 `{ComponentName}Props`
- 컴포넌트: **`function` 키워드**(화살표 함수 금지)
- 일반 함수: **화살표 함수**
- 변수: `camelCase`, 타입: `PascalCase`

```tsx
'use client';

import { cn } from '@/utils/cn';

type Props = {
  clubName: string;
  memberCount: number;
  isRecruiting?: boolean;
  onApply?: () => void;
};

export function ClubCard({
  clubName,
  memberCount,
  isRecruiting = false,
  onApply,
}: Props) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isRecruiting && 'border-blue-500',
      )}
    >
      <h3 className="text-lg font-semibold">{clubName}</h3>
      <p className="text-sm text-gray-600">{memberCount}명</p>
      {onApply && (
        <button onClick={onApply} className="mt-2 text-blue-500">
          지원하기
        </button>
      )}
    </div>
  );
}
```

---

## TanStack Query 사용 규칙

### Query Key 관리
도메인별로 `queryKeys` 객체를 정의하고 문자열 키 직접 사용 금지.

```ts
// packages/hooks/src/clubQueryKeys.ts
import type { ClubSearchParams } from '@duing/types';

export const clubQueryKeys = {
  all: ['club'] as const,
  list: (params: ClubSearchParams) => [...clubQueryKeys.all, 'list', params] as const,
  detail: (clubId: number) => [...clubQueryKeys.all, 'detail', clubId] as const,
};
```

### Query / Mutation 훅 네이밍
- 조회: `use{Domain}{Action}Query` (예: `useClubListQuery`, `useClubDetailQuery`)
- 변경: `use{Domain}{Action}Mutation` (예: `useApplyClubMutation`)
- 훅 안에서 HTTP 를 직접 호출하지 말고 `@duing/api` 의 메서드를 호출한다.

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import type { ClubSearchParams } from '@duing/types';
import { useApiClient } from '@duing/hooks';
import { clubQueryKeys } from './clubQueryKeys';

export function useClubListQuery(params: ClubSearchParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubQueryKeys.list(params),
    queryFn: () => client.clubs.list(params),
  });
}
```

### Mutation 후 캐시 무효화
- `onSuccess`에서 관련 query key 를 무효화한다.
- 광범위한 무효화 대신 **가장 좁은 범위의 key**를 사용한다 (`all` 보다 `list`/`detail` 우선).

---

## Zustand 사용 규칙

- **전역 상태만** Zustand 에 둔다 (예: 로그인 사용자 정보, 전역 모달 상태)
- **서버 상태는 절대 Zustand 에 저장하지 않는다** — TanStack Query 가 진실 공급원
- 한 도메인 = 한 스토어 = 한 파일 (`packages/stores/src/{domain}-store.ts`)
- 액션은 스토어 내부에 정의 — 외부에서 `setState` 직접 호출 금지

```ts
// packages/stores/src/auth-store.ts
import { create } from 'zustand';
import type { User } from '@duing/types';

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

## API 레이어 규칙

- HTTP 호출은 `packages/api/` 의 `DuingApiClient` 만 사용한다 — 컴포넌트/훅에서 `ky`/`fetch` 직접 호출 금지.
- 백엔드 변경 시 흐름:
  1. `packages/types/` 의 도메인 타입 갱신 (또는 `pnpm gen:api` 로 자동 생성)
  2. `packages/api/src/client.ts` 에 메서드 추가/수정
  3. `packages/hooks/` 의 훅 갱신
- API 메서드명은 동사로 시작 (`list`, `detail`, `create`, `submit`, `updateStatus`).
- ky 인스턴스는 `packages/api/src/client.ts` 내부에서 단일 생성 (`createApiClient`).

```ts
// packages/api/src/client.ts (이미 구현 — 추가 메서드 시 동일 패턴 유지)
clubs: {
  list: (params) =>
    jsonOk<PageResponse<ClubSummary>>(
      http.get('clubs', { searchParams: cleanParams(params) }),
    ),
  detail: (clubId) => jsonOk<ClubDetail>(http.get(`clubs/${clubId}`)),
  // ...
}
```

---

## 코드 컨벤션

- **Conventional Commits**: `<type>(<scope>): <description>` (commitlint 도입 시 강제)
- **타입 선언**: `type` 사용 (`interface` 금지). 단, 라이브러리 augmentation 등 불가피 시 예외.
- **Import 순서** (그룹 사이 빈 줄):
  1. external (`react`, `next`, 외부 라이브러리)
  2. 워크스페이스 패키지 (`@duing/*`)
  3. internal absolute (`@/...`)
  4. parent (`../...`)
  5. sibling (`./...`)
  6. type imports (`import type { ... }`)
- **`'use client'`**: 파일 최상단, import 위
- **조건부 className**: `cn()` 유틸 사용 (`clsx` + `tailwind-merge`)

---

## 테스트

- 코드 작성 후 `pnpm test`로 검증
- 성공 / 실패 / 엣지 케이스를 모두 다룬다
- 실패 케이스는 백엔드 Swagger 에러 응답을 기반으로 작성
- 테스트 설명은 무엇을 검증하는지 명확하게 — 과도한 추상화 금지
- 타입 단언(`as`) 사용 금지

### 모킹 규칙
- **API 응답만 모킹**한다 — TanStack Query 내부 모킹 금지 (`useQuery` 자체를 mock 하지 않음)
- 공용 `render` 유틸을 사용한다 (`QueryClientProvider`, `ApiClientProvider`, 필요한 Provider 포함)

### 폴더 구조

```
apps/web/test/
└── 페이지명/
    ├── 페이지명.test.tsx
    ├── 훅이름.test.tsx
    ├── components/
    │   └── 컴포넌트명.test.tsx
    └── 페이지명.data.ts
```

### Mock 데이터
- 기본은 `it` 블록 내부에 선언
- 같은 페이지에서 여러 번 쓰이면 `test/페이지명/페이지명.data.ts`로 추출
- 여러 페이지에서 공유될 때만 `test/shared/[domain]Mock.ts`로 추출

---

## Git / PR 규칙

- 브랜치명: `{type}/{이슈번호}-{설명}` (예: `feat/12-club-list-ui`)
- 커밋 메시지: 한국어, `[#이슈번호] 작업 내용` 형식 (예: `[#12] 동아리 목록 페이지 UI 구현`)
- PR 템플릿: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항
- PR 본문은 파일명·컴포넌트명 나열 금지 — 작업 내용 중심의 자연스러운 글로 작성

### 페이지 단위 브랜치 전략
PR 크기를 관리하기 위해 **페이지(또는 독립 기능) 1개 = 브랜치 1개 = PR 1개** 원칙을 따른다.

- 각 브랜치는 단일 페이지 또는 독립된 기능 단위(구현 + 테스트)에 대응
- 브랜치는 `develop`에서 분기, `develop`으로 PR
- 백엔드 API 에 의존하는 경우 해당 백엔드 PR 이 merge 된 후 작업 시작

```
develop
  └─ feat/12-club-list-ui           # 동아리 목록 페이지
  └─ feat/13-club-detail-ui         # 동아리 상세 페이지
  └─ feat/14-recruitment-calendar   # 모집 달력 페이지
  └─ feat/15-application-form       # 지원서 작성 폼
```

### CI Checks
PR 에서 `frontend-ci.yml` 이 자동 실행: lint / typecheck / build / test. 통과 못 하면 머지 차단.

---

## React Native 호환 원칙 (앞으로 mobile 앱 추가 대비)

| 카테고리 | 공유 (RN 그대로 재사용) | 플랫폼별 (web 따로 / mobile 따로) |
|---|---|---|
| 타입 | `@duing/types` ✅ | — |
| API 호출 | `@duing/api` (ky/fetch) ✅ | — |
| 검증 (Zod) | `@duing/schemas` ✅ | — |
| 서버 상태 (TanStack Query 훅) | `@duing/hooks` ✅ | — |
| 클라이언트 상태 (Zustand) | `@duing/stores` ✅ | — |
| Storage | `@duing/storage` 인터페이스 ✅ | `webStorage` (localStorage) / `nativeStorage` (AsyncStorage) |
| UI 컴포넌트 | ❌ 공유 시도 금지 | Tailwind+shadcn (web) / RN Components (mobile) |
| 라우팅 | ❌ | Next App Router (web) / Expo Router (mobile) |

`packages/*` 코드에는 DOM API(`window`, `document`) 나 RN 전용 API 를 직접 import 하지 않는다.
플랫폼 분기가 필요한 경우 **인터페이스 + 구현체** 패턴(`@duing/storage` 처럼) 으로 추상화한다.

---

## 에이전트 & 스킬 자동 사용 규칙

모든 에이전트(`.claude/agents/`)와 스킬(`.claude/skills/`)은 사용자가 명시적으로 요청하지 않아도
작업 맥락에 맞으면 능동적으로 사용한다. (현재는 백엔드 스킬만 있음 — 프론트 스킬은 후속 추가)

---

## 절대 금지

- `'use client'` 무분별 추가 — Server Component 가 가능한 곳은 Server 로 유지
- 서버 상태를 Zustand 또는 `useState` 로 관리 — 반드시 TanStack Query 사용
- `any` 타입, `as` 타입 단언 남용
- `@duing/api` 없이 컴포넌트/훅에서 `ky` 또는 `fetch` 직접 호출
- `.env` 파일 또는 코드 내 시크릿 값 직접 기재
- 의사코드, 미완성 코드 제공
- TanStack Query 내부 모킹 (`useQuery` 자체를 mock)
- `useEffect` 안에서 데이터 패칭 — TanStack Query / Server Component 사용
- `packages/*` 에 DOM API 또는 RN 전용 API 직접 import — 플랫폼 추상화 깨짐
