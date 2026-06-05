# PR2 — 어드민 GlobalEvent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN 이 `/admin/global-events` 에서 글로벌 이벤트 목록을 검색·페이징하고, 작성·수정·삭제하며, 카테고리 분포 위젯으로 OTHER 카테고리 남용을 모니터링할 수 있는 UI 를 신설한다.

**Architecture:** Du-ing 프론트 `apps/web/app/admin/*` 라우트 패턴(예: `notices`, `promotions`)을 그대로 따른다. 페이지는 thin Server Component → `_pages/*Page` Client Component 위임. 데이터는 `useQuery`/`useMutation` 으로만 호출(서버 상태에 `useState` 금지). 패키지 계층은 `types → schemas → api → hooks → apps/web` 순서로 빌드. 카테고리 분포 위젯은 독립 쿼리(`useGlobalEventCategoryStatsQuery`)로 fetch 하여 필터/페이지 변경에 영향받지 않음. mutation 의 `onSuccess` 에서 분포 쿼리도 invalidate.

**Tech Stack:** Next.js 15 App Router · React 19 · pnpm workspaces · TanStack Query v5 · ky · zod · Tailwind · `@duing/types|schemas|api|hooks`.

**브랜치:** `feat/calendar-globalevent-admin-ui` (develop 분기). **선행 의존:** PR1 (`feat/calendar-globalevent-backend`) 머지 후 시작.

**spec 참조:** [`docs/superpowers/specs/2026-06-05-calendar-integration-design.md`](../specs/2026-06-05-calendar-integration-design.md) §2.

---

## 사전 컨벤션 (모든 task 공통)

- 타입 선언 `type` 만 사용 (`interface` 금지).
- `any` 금지, `as` 단언 금지. zod parse 또는 타입 가드 사용.
- 변수명 풀네임 (`data: noticeList`, `e: clickEvent` 등 — `data`, `e` 단독 금지).
- 서버 상태는 무조건 TanStack Query — `useEffect` + `fetch` 금지.
- 컴포넌트 파일 외에는 `'use client'` 추가 금지. `_components/*.tsx` 는 클라이언트, `page.tsx` 는 서버.
- 커밋: `feat(frontend): ...` (Conventional Commits). Claude attribution 없음.
- 작업 디렉터리: `frontend/`. 빌드는 `pnpm --filter web build` (web 앱만) 또는 `pnpm build` (전체).
- 카테고리 한글 라벨 매핑은 한 곳에만 정의 — `_lib/categoryLabels.ts`.

---

## File Structure (전체 PR 산출물)

**신규**
```
frontend/packages/types/src/
└── globalEvent.ts

frontend/packages/hooks/src/
├── globalEvents.ts
└── globalEventQueryKeys.ts

frontend/apps/web/app/admin/global-events/
├── page.tsx
├── new/page.tsx
├── [eventId]/edit/page.tsx
├── _lib/
│   ├── categoryLabels.ts
│   ├── parseGlobalEventFormState.ts
│   └── extractErrorMessage.ts
├── _pages/
│   ├── AdminGlobalEventsListPage.tsx
│   ├── AdminGlobalEventNewPage.tsx
│   └── AdminGlobalEventEditPage.tsx
└── _components/
    ├── AdminGlobalEventTable.tsx
    ├── AdminGlobalEventFilterBar.tsx
    ├── AdminGlobalEventCategoryStats.tsx
    ├── AdminGlobalEventForm.tsx
    └── AdminGlobalEventDeleteDialog.tsx
```

**수정**
```
frontend/packages/types/src/index.ts                 # globalEvent 재export
frontend/packages/schemas/src/index.ts               # create/updateGlobalEventSchema 추가
frontend/packages/api/src/client.ts                  # globalEvents + admin.globalEvents 메서드 추가
frontend/packages/hooks/src/index.ts                 # globalEvents 훅 + queryKeys 재export
frontend/apps/web/app/admin/_lib/adminSections.ts    # 글로벌 이벤트 항목 추가
```

---

## Task 1: 타입 + zod 스키마

도메인 타입을 추가하고, 폼 검증 규칙을 백엔드와 1:1 정합으로 정의.

**Files:**
- Create: `frontend/packages/types/src/globalEvent.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: `globalEvent.ts` 타입 작성**

```ts
export type GlobalEventCategory =
  | 'FAIR'
  | 'FESTIVAL'
  | 'APPLICATION'
  | 'CONTEST'
  | 'UNION'
  | 'OTHER';

export type GlobalEventCard = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  category: GlobalEventCategory;
};

export type GlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  category: GlobalEventCategory;
};

export type AdminGlobalEventCreator = { id: number; name: string };

export type AdminGlobalEventSummary = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  category: GlobalEventCategory;
  createdById: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminGlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  category: GlobalEventCategory;
  createdBy: AdminGlobalEventCreator;
  createdAt: string;
  updatedAt: string;
};

export type CreateGlobalEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  linkUrl?: string;
  category: GlobalEventCategory;
};

export type UpdateGlobalEventPayload = Partial<CreateGlobalEventPayload>;

export type GlobalEventListParams = {
  from?: string;
  to?: string;
  category?: GlobalEventCategory;
};

export type AdminGlobalEventListParams = {
  category?: GlobalEventCategory;
  keyword?: string;
  page: number;
  size: number;
};

export type GlobalEventCategoryStats = Record<GlobalEventCategory, number>;
```

- [ ] **Step 2: `packages/types/src/index.ts` 에 재export 추가**

마지막 줄 다음에 추가:

```ts
export * from './globalEvent';
```

- [ ] **Step 3: 스키마 추가**

`packages/schemas/src/index.ts` 파일 끝에 추가:

```ts
const LINK_URL_PATTERN = /^https?:\/\/.+/;

export const createGlobalEventSchema = z
  .object({
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(120, '제목은 120자 이하여야 합니다.')
      .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
    description: z.string().max(2000, '설명은 2000자 이하여야 합니다.').optional().or(z.literal('')),
    startAt: z.string().min(1, '시작 시각은 필수입니다.'),
    endAt: z.string().min(1, '종료 시각은 필수입니다.'),
    location: z.string().max(200, '장소는 200자 이하여야 합니다.').optional().or(z.literal('')),
    linkUrl: z
      .string()
      .max(500, '링크는 500자 이하여야 합니다.')
      .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
      .optional()
      .or(z.literal('')),
    category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER'], {
      errorMap: () => ({ message: '카테고리를 선택해주세요.' }),
    }),
  })
  .refine((data) => new Date(data.endAt) >= new Date(data.startAt), {
    message: '종료 시각은 시작 시각 이후여야 합니다.',
    path: ['endAt'],
  });

export type CreateGlobalEventInput = z.infer<typeof createGlobalEventSchema>;

export const updateGlobalEventSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().or(z.literal('')),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    location: z.string().max(200).optional().or(z.literal('')),
    linkUrl: z
      .string()
      .max(500)
      .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
      .optional()
      .or(z.literal('')),
    category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER']).optional(),
  })
  // partial update 에서도 startAt / endAt 둘 다 제공되면 순서 검증.
  // 한쪽만 제공되어 서버에서 기존 값과 비교해야 하는 케이스는 백엔드 entity 의 validatePeriod 가 최종 방어선.
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt) {
      if (new Date(data.endAt) < new Date(data.startAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '종료 시각은 시작 시각 이후여야 합니다.',
          path: ['endAt'],
        });
      }
    }
  });

export type UpdateGlobalEventInput = z.infer<typeof updateGlobalEventSchema>;
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter @duing/types typecheck && pnpm --filter @duing/schemas typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/types/src/globalEvent.ts \
        frontend/packages/types/src/index.ts \
        frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): GlobalEvent 타입·zod 스키마 추가"
```

---

## Task 2: API 클라이언트 메서드 추가

`globalEvents` (공개) 와 `admin.globalEvents` (어드민 CRUD + 통계) 두 그룹 추가. 백엔드 응답이 `ApiResponse<{ distribution: Record }>` 형태이므로 클라이언트에서 `distribution` 평탄화.

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 타입 import 추가**

파일 상단 type import 블록에 추가:

```ts
import type {
  AdminGlobalEventDetail,
  AdminGlobalEventListParams,
  AdminGlobalEventSummary,
  CreateGlobalEventPayload,
  GlobalEventCard,
  GlobalEventCategoryStats,
  GlobalEventDetail,
  GlobalEventListParams,
  UpdateGlobalEventPayload,
} from '@duing/types';
```

- [ ] **Step 2: 인터페이스 `DuingApiClient` 에 공개 메서드 추가**

`clubEvents: { ... }` 블록 바로 위 또는 아래에 추가:

```ts
globalEvents: {
  list(params?: GlobalEventListParams): Promise<GlobalEventCard[]>;
  get(eventId: number): Promise<GlobalEventDetail>;
};
```

- [ ] **Step 3: `admin: { ... }` 인터페이스 안에 어드민 메서드 추가**

`notices: { ... }` 블록 바로 아래에:

```ts
globalEvents: {
  list(params: AdminGlobalEventListParams): Promise<PageResponse<AdminGlobalEventSummary>>;
  detail(eventId: number): Promise<AdminGlobalEventDetail>;
  create(payload: CreateGlobalEventPayload): Promise<number>;
  update(eventId: number, payload: UpdateGlobalEventPayload): Promise<void>;
  remove(eventId: number): Promise<void>;
  categoryStats(): Promise<GlobalEventCategoryStats>;
};
```

- [ ] **Step 4: 구현부 추가 (`createApiClient` 의 return 블록)**

`clubEvents: { ... }` 바로 다음에 (notices 와 admin 블록 사이 위치):

```ts
globalEvents: {
  list: (params) =>
    jsonOk<GlobalEventCard[]>(
      http.get('global-events', { searchParams: cleanParams(params ?? {}) }),
    ),
  get: (eventId) =>
    jsonOk<GlobalEventDetail>(http.get(`global-events/${eventId}`)),
},
```

`admin: { ... promotions: ... }` 블록 내부, `notices: { ... }` 다음에:

```ts
globalEvents: {
  list: (params) =>
    jsonOk<PageResponse<AdminGlobalEventSummary>>(
      http.get('admin/global-events', { searchParams: cleanParams(params) }),
    ),
  detail: (eventId) =>
    jsonOk<AdminGlobalEventDetail>(http.get(`admin/global-events/${eventId}`)),
  create: (payload) =>
    jsonOk<number>(http.post('admin/global-events', { json: payload })),
  update: (eventId, payload) =>
    jsonVoid(http.patch(`admin/global-events/${eventId}`, { json: payload })),
  remove: (eventId) =>
    jsonVoid(http.delete(`admin/global-events/${eventId}`)),
  categoryStats: async () => {
    const wrapper = await jsonOk<{ distribution: GlobalEventCategoryStats }>(
      http.get('admin/global-events/category-stats'),
    );
    return wrapper.distribution;
  },
},
```

> `categoryStats` 는 백엔드 응답 `{ distribution: { FAIR: ..., ... } }` 에서 `distribution` 만 꺼내 평탄화한 `Record` 를 반환. 호출자가 `Record` 로 다룰 수 있도록.

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @duing/api typecheck`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): GlobalEvent API 클라이언트 메서드 추가"
```

---

## Task 3: React Query 훅 + queryKeys

공개 1 개 (캘린더 PR 3 에서도 사용) + 어드민 4 개 + 통계 1 개. mutation onSuccess 에서 통계도 함께 invalidate.

**Files:**
- Create: `frontend/packages/hooks/src/globalEventQueryKeys.ts`
- Create: `frontend/packages/hooks/src/globalEvents.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: queryKeys 작성**

```ts
import type { AdminGlobalEventListParams, GlobalEventListParams } from '@duing/types';

export const globalEventKeys = {
  all: ['global-events'] as const,
  publicList: (params: GlobalEventListParams) =>
    [...globalEventKeys.all, 'public', 'list', params] as const,
  publicDetail: (eventId: number) =>
    [...globalEventKeys.all, 'public', 'detail', eventId] as const,
  adminList: (params: AdminGlobalEventListParams) =>
    [...globalEventKeys.all, 'admin', 'list', params] as const,
  adminDetail: (eventId: number) =>
    [...globalEventKeys.all, 'admin', 'detail', eventId] as const,
  categoryStats: () => [...globalEventKeys.all, 'admin', 'category-stats'] as const,
};
```

- [ ] **Step 2: 훅 작성**

`packages/hooks/src/globalEvents.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminGlobalEventListParams,
  CreateGlobalEventPayload,
  GlobalEventListParams,
  UpdateGlobalEventPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { globalEventKeys } from './globalEventQueryKeys';

export function useGlobalEventListQuery(params: GlobalEventListParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.publicList(params),
    queryFn: () => client.globalEvents.list(params),
    staleTime: 30 * 1000,
  });
}

export function useGlobalEventDetailQuery(eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.publicDetail(eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.globalEvents.get(eventId);
    },
    enabled: eventId !== null,
    staleTime: 30 * 1000,
  });
}

export function useAdminGlobalEventListQuery(params: AdminGlobalEventListParams) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.adminList(params),
    queryFn: () => client.admin.globalEvents.list(params),
    staleTime: 15 * 1000,
  });
}

export function useAdminGlobalEventDetailQuery(eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.adminDetail(eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.admin.globalEvents.detail(eventId);
    },
    enabled: eventId !== null,
    staleTime: 15 * 1000,
  });
}

export function useGlobalEventCategoryStatsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: globalEventKeys.categoryStats(),
    queryFn: () => client.admin.globalEvents.categoryStats(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminGlobalEventCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGlobalEventPayload) => client.admin.globalEvents.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
    },
  });
}

export function useAdminGlobalEventUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: number; payload: UpdateGlobalEventPayload }) =>
      client.admin.globalEvents.update(eventId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
      queryClient.invalidateQueries({ queryKey: globalEventKeys.adminDetail(variables.eventId) });
    },
  });
}

export function useAdminGlobalEventDeleteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => client.admin.globalEvents.remove(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalEventKeys.all });
    },
  });
}
```

`globalEventKeys.all` 을 invalidate 하면 publicList / publicDetail / adminList / adminDetail / categoryStats 모두 자동 무효화 — 위젯도 mutation 후 자동 갱신.

- [ ] **Step 3: `packages/hooks/src/index.ts` 재export 추가**

파일 끝에 추가:

```ts
export {
  useGlobalEventListQuery,
  useGlobalEventDetailQuery,
  useAdminGlobalEventListQuery,
  useAdminGlobalEventDetailQuery,
  useGlobalEventCategoryStatsQuery,
  useAdminGlobalEventCreateMutation,
  useAdminGlobalEventUpdateMutation,
  useAdminGlobalEventDeleteMutation,
} from './globalEvents';
export { globalEventKeys } from './globalEventQueryKeys';
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter @duing/hooks typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/hooks/src/globalEvents.ts \
        frontend/packages/hooks/src/globalEventQueryKeys.ts \
        frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): GlobalEvent React Query 훅 추가"
```

---

## Task 4: 어드민 사이드바 항목 등록

`adminSections.ts` 에 항목 추가. 그룹은 `'커뮤니티 운영'` (notices 와 동일 그룹).

**Files:**
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts`

- [ ] **Step 1: 항목 추가**

`ADMIN_SECTIONS` 배열의 `'/admin/notices'` 다음에 추가:

```ts
{
  href: '/admin/global-events',
  title: '글로벌 이벤트',
  description: '학교 단위 행사 일정 작성·수정·삭제 + 카테고리 분포',
  group: '커뮤니티 운영',
},
```

- [ ] **Step 2: 동작 확인 (수동)**

Run: `pnpm --filter web dev`
- `/admin` 접속 → 사이드바에 "글로벌 이벤트" 항목 노출 확인.
- 클릭 시 `/admin/global-events` 로 라우팅 (다음 task 에서 페이지 구현).

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/admin/_lib/adminSections.ts
git commit -m "feat(frontend): 어드민 사이드바에 글로벌 이벤트 항목 등록"
```

---

## Task 5: 폼 컴포넌트 + 폼 상태 파서 + 카테고리 라벨

생성/수정 공통으로 쓰는 `AdminGlobalEventForm`. 카테고리 select 정책 (placeholder + OTHER 마지막 + OTHER 선택 시 경고). datetime-local 두 개 + URL input + textarea(카운터).

**Files:**
- Create: `frontend/apps/web/app/admin/global-events/_lib/categoryLabels.ts`
- Create: `frontend/apps/web/app/admin/global-events/_lib/parseGlobalEventFormState.ts`
- Create: `frontend/apps/web/app/admin/global-events/_lib/extractErrorMessage.ts`
- Create: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx`

- [ ] **Step 1: 카테고리 라벨 매핑**

`_lib/categoryLabels.ts`:

```ts
import type { GlobalEventCategory } from '@duing/types';

export const GLOBAL_EVENT_CATEGORY_LABEL: Record<GlobalEventCategory, string> = {
  FAIR: '박람회',
  FESTIVAL: '축제·공연',
  APPLICATION: '신청 시작/마감',
  CONTEST: '대회',
  UNION: '총동연 행사',
  OTHER: '기타 (가급적 다른 카테고리 사용)',
};

// select 의 표시 순서 — OTHER 가 마지막.
export const GLOBAL_EVENT_CATEGORY_ORDER: GlobalEventCategory[] = [
  'FAIR',
  'FESTIVAL',
  'APPLICATION',
  'CONTEST',
  'UNION',
  'OTHER',
];
```

- [ ] **Step 2: 폼 상태 파서**

`_lib/parseGlobalEventFormState.ts`:

```ts
import type {
  AdminGlobalEventDetail,
  CreateGlobalEventPayload,
  GlobalEventCategory,
  UpdateGlobalEventPayload,
} from '@duing/types';

export type GlobalEventFormState = {
  title: string;
  description: string;
  startAt: string;     // datetime-local "YYYY-MM-DDTHH:mm"
  endAt: string;
  location: string;
  linkUrl: string;
  category: GlobalEventCategory | '';
};

export const EMPTY_GLOBAL_EVENT_FORM: GlobalEventFormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  location: '',
  linkUrl: '',
  category: '',
};

// ISO 8601 → datetime-local (분 단위 절삭)
const toLocal = (iso: string | null | undefined): string => {
  if (!iso) return '';
  return iso.slice(0, 16);
};

// datetime-local → ISO LocalDateTime (백엔드 LocalDateTime 파싱 가능 형식)
const toLocalDateTime = (local: string): string => `${local}:00`;

export function fromDetail(detail: AdminGlobalEventDetail): GlobalEventFormState {
  return {
    title: detail.title,
    description: detail.description ?? '',
    startAt: toLocal(detail.startAt),
    endAt: toLocal(detail.endAt),
    location: detail.location ?? '',
    linkUrl: detail.linkUrl ?? '',
    category: detail.category,
  };
}

export function toCreatePayload(state: GlobalEventFormState): CreateGlobalEventPayload {
  if (state.category === '') {
    throw new Error('category not selected');
  }
  return {
    title: state.title.trim(),
    description: state.description ? state.description : undefined,
    startAt: toLocalDateTime(state.startAt),
    endAt: toLocalDateTime(state.endAt),
    location: state.location ? state.location : undefined,
    linkUrl: state.linkUrl ? state.linkUrl : undefined,
    category: state.category,
  };
}

export function toUpdatePayload(state: GlobalEventFormState): UpdateGlobalEventPayload {
  const payload: UpdateGlobalEventPayload = {
    title: state.title.trim(),
    description: state.description,
    startAt: state.startAt ? toLocalDateTime(state.startAt) : undefined,
    endAt: state.endAt ? toLocalDateTime(state.endAt) : undefined,
    location: state.location,
    linkUrl: state.linkUrl,
  };
  if (state.category !== '') payload.category = state.category;
  return payload;
}
```

- [ ] **Step 3: 에러 메시지 추출**

`_lib/extractErrorMessage.ts` — notices 의 동일 파일을 참고해 동일하게 작성:

```ts
import { HTTPError } from 'ky';

export async function extractErrorMessage(error: unknown): Promise<string | null> {
  if (!(error instanceof HTTPError)) return null;
  try {
    const body = (await error.response.json()) as { message?: string };
    return body.message ?? null;
  } catch {
    return null;
  }
}
```

(notices 의 시그니처가 다르면 — sync/async — 그쪽과 통일.)

- [ ] **Step 4: 폼 컴포넌트 작성**

`_components/AdminGlobalEventForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { createGlobalEventSchema, updateGlobalEventSchema } from '@duing/schemas';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
} from '../_lib/categoryLabels';
import type { GlobalEventFormState } from '../_lib/parseGlobalEventFormState';

type Props = {
  initialState: GlobalEventFormState;
  submitLabel: string;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  onSubmit: (state: GlobalEventFormState) => void;
  errorMessage?: string | null;
};

export function AdminGlobalEventForm({
  initialState,
  submitLabel,
  isSubmitting,
  mode,
  onSubmit,
  errorMessage,
}: Props) {
  const [state, setState] = useState<GlobalEventFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof GlobalEventFormState, string>>>({});

  const update = <K extends keyof GlobalEventFormState>(key: K, value: GlobalEventFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const schema = mode === 'create' ? createGlobalEventSchema : updateGlobalEventSchema;
    const result = schema.safeParse(state);
    if (!result.success) {
      const errors: Partial<Record<keyof GlobalEventFormState, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof GlobalEventFormState | undefined;
        if (key) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSubmit(state);
  };

  const descriptionLength = state.description.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="카테고리" error={fieldErrors.category}>
        <select
          required
          value={state.category}
          onChange={(event) => {
            const next = event.target.value;
            if (next === '' || GLOBAL_EVENT_CATEGORY_ORDER.includes(next as never)) {
              update('category', next as GlobalEventFormState['category']);
            }
          }}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        >
          <option value="" disabled hidden>
            카테고리 선택
          </option>
          {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => (
            <option key={categoryValue} value={categoryValue}>
              {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
            </option>
          ))}
        </select>
        {state.category === 'OTHER' && (
          <p className="mt-1 text-xs text-coral">
            ⚠️ 5개 카테고리 중 적합한 것이 없는 경우에만 사용해주세요.
          </p>
        )}
      </Field>

      <Field label="제목 (≤120자)" error={fieldErrors.title}>
        <input
          type="text"
          maxLength={120}
          required
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="시작 일시" error={fieldErrors.startAt}>
          <input
            type="datetime-local"
            required
            value={state.startAt}
            onChange={(event) => update('startAt', event.target.value)}
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
        <Field label="종료 일시" error={fieldErrors.endAt}>
          <input
            type="datetime-local"
            required
            value={state.endAt}
            onChange={(event) => update('endAt', event.target.value)}
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
      </div>

      <Field label="장소 (선택, ≤200자)" error={fieldErrors.location}>
        <input
          type="text"
          maxLength={200}
          value={state.location}
          onChange={(event) => update('location', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="링크 URL (선택, ≤500자)" error={fieldErrors.linkUrl}>
        <input
          type="url"
          maxLength={500}
          placeholder="https://..."
          value={state.linkUrl}
          onChange={(event) => update('linkUrl', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label={`설명 (선택, ${descriptionLength}/2000)`} error={fieldErrors.description}>
        <textarea
          rows={5}
          maxLength={2000}
          value={state.description}
          onChange={(event) => update('description', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      {errorMessage && <p className="text-sm text-coral">{errorMessage}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-60"
        >
          {isSubmitting ? '저장 중…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </label>
  );
}
```

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_lib/ \
        frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx
git commit -m "feat(frontend): GlobalEvent 어드민 폼 컴포넌트 + 카테고리 라벨"
```

---

## Task 6: 테이블 + 필터바 + 삭제 다이얼로그

`AdminNoticesTable` / `AdminNoticesFilterBar` 와 동일 패턴.

**Files:**
- Create: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventTable.tsx`
- Create: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventFilterBar.tsx`
- Create: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventDeleteDialog.tsx`

- [ ] **Step 1: 테이블 컴포넌트**

```tsx
'use client';

import Link from 'next/link';
import type { AdminGlobalEventSummary } from '@duing/types';
import { GLOBAL_EVENT_CATEGORY_LABEL } from '../_lib/categoryLabels';

type Props = {
  items: AdminGlobalEventSummary[];
  onDeleteClick: (eventId: number, title: string) => void;
};

const formatRange = (startAt: string, endAt: string): string => {
  const start = startAt.slice(0, 16).replace('T', ' ');
  const end = endAt.slice(0, 16).replace('T', ' ');
  return `${start} ~ ${end}`;
};

export function AdminGlobalEventTable({ items, onDeleteClick }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">등록된 이벤트가 없습니다.</p>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-paper overflow-hidden">
      <table className="w-full text-[13.5px]">
        <thead className="bg-cream-2 text-charcoal-2">
          <tr>
            <th className="px-4 py-3 text-left">카테고리</th>
            <th className="px-4 py-3 text-left">제목</th>
            <th className="px-4 py-3 text-left">기간</th>
            <th className="px-4 py-3 text-left">장소</th>
            <th className="px-4 py-3 w-[140px]">관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <td className="px-4 py-3 text-charcoal-2">
                {GLOBAL_EVENT_CATEGORY_LABEL[item.category]}
              </td>
              <td className="px-4 py-3 text-ink font-semibold">{item.title}</td>
              <td className="px-4 py-3 text-charcoal-2 font-mono text-[12.5px]">
                {formatRange(item.startAt, item.endAt)}
              </td>
              <td className="px-4 py-3 text-charcoal-3">{item.location ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/global-events/${item.id}/edit`}
                    className="px-3 py-1 rounded-md border border-line text-[12.5px] text-ink"
                  >
                    수정
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDeleteClick(item.id, item.title)}
                    className="px-3 py-1 rounded-md border border-coral text-[12.5px] text-coral"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 필터바 컴포넌트**

```tsx
'use client';

import type { GlobalEventCategory } from '@duing/types';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
} from '../_lib/categoryLabels';

type Props = {
  category: GlobalEventCategory | 'ALL';
  keyword: string;
  onCategoryChange: (next: GlobalEventCategory | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
};

export function AdminGlobalEventFilterBar({
  category,
  keyword,
  onCategoryChange,
  onKeywordChange,
  onKeywordSubmit,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border border-line rounded-lg bg-paper">
      <select
        value={category}
        onChange={(event) => onCategoryChange(event.target.value as GlobalEventCategory | 'ALL')}
        className="px-3 py-2 rounded-md border border-line text-[13px]"
      >
        <option value="ALL">전체 카테고리</option>
        {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => (
          <option key={categoryValue} value={categoryValue}>
            {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
          </option>
        ))}
      </select>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onKeywordSubmit();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목·설명 검색"
          className="px-3 py-2 rounded-md border border-line text-[13px] w-[220px]"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-md bg-ink text-paper text-[13px]"
        >
          검색
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 삭제 다이얼로그**

```tsx
'use client';

type Props = {
  title: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminGlobalEventDeleteDialog({ title, isPending, onCancel, onConfirm }: Props) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-2xl bg-paper p-6">
        <h2 className="text-[16px] font-bold text-ink mb-2">이벤트 삭제</h2>
        <p className="text-[13.5px] text-charcoal-2 mb-6">
          "<strong className="text-ink">{title}</strong>" 를 삭제하시겠어요? 캘린더에서 즉시 사라집니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-full border border-line text-[13px]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-full bg-coral text-paper text-[13px] font-semibold disabled:opacity-60"
          >
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventTable.tsx \
        frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventFilterBar.tsx \
        frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventDeleteDialog.tsx
git commit -m "feat(frontend): GlobalEvent 어드민 테이블·필터바·삭제 다이얼로그"
```

---

## Task 7: 카테고리 분포 위젯 (OTHER ≥ 15% 경고)

목록 페이지 상단. 독립 쿼리 (`useGlobalEventCategoryStatsQuery`) — 필터/페이지 변경에 영향받지 않음. OTHER 비율 ≥ 15% 이면 막대 색을 coral 로.

**Files:**
- Create: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventCategoryStats.tsx`

- [ ] **Step 1: 위젯 작성**

```tsx
'use client';

import { useGlobalEventCategoryStatsQuery } from '@duing/hooks';
import type { GlobalEventCategory } from '@duing/types';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
} from '../_lib/categoryLabels';

const OTHER_WARN_THRESHOLD = 0.15;
const NORMAL_BAR_COLOR = 'var(--sage)';
const WARN_BAR_COLOR = '#D97757';

export function AdminGlobalEventCategoryStats() {
  const statsQuery = useGlobalEventCategoryStatsQuery();

  if (statsQuery.isLoading) {
    return (
      <div className="border border-line rounded-lg bg-paper p-5 text-[13px] text-charcoal-3">
        분포를 불러오는 중…
      </div>
    );
  }
  if (statsQuery.isError || !statsQuery.data) {
    return (
      <div className="border border-line rounded-lg bg-paper p-5 text-[13px] text-coral flex items-center justify-between">
        <span>분포를 불러오지 못했습니다.</span>
        <button
          type="button"
          onClick={() => statsQuery.refetch()}
          className="px-3 py-1 rounded-md border border-line text-charcoal-2"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const distribution = statsQuery.data;
  const total = GLOBAL_EVENT_CATEGORY_ORDER.reduce(
    (sum, categoryValue) => sum + (distribution[categoryValue] ?? 0),
    0,
  );
  const otherRatio = total === 0 ? 0 : (distribution.OTHER ?? 0) / total;
  const otherIsAbove = otherRatio >= OTHER_WARN_THRESHOLD;

  return (
    <div className="border border-line rounded-lg bg-paper p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold text-ink">카테고리 분포</h2>
        <span className="text-[12px] text-charcoal-3">총 {total}건</span>
      </div>
      <ul className="space-y-2">
        {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => {
          const count = distribution[categoryValue] ?? 0;
          const ratio = total === 0 ? 0 : count / total;
          const widthPercent = Math.max(2, Math.round(ratio * 100));
          const color = pickBarColor(categoryValue, ratio, otherIsAbove);
          return (
            <li key={categoryValue} className="flex items-center gap-3">
              <span className="w-[140px] text-[12.5px] text-charcoal-2">
                {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
              </span>
              <div className="flex-1 h-3 rounded-full bg-cream-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPercent}%`, background: color }}
                />
              </div>
              <span className="w-[60px] text-right text-[12.5px] font-mono text-charcoal-2">
                {count}건
              </span>
            </li>
          );
        })}
      </ul>
      {otherIsAbove && (
        <p className="mt-3 text-[12px] text-coral">
          ⚠️ OTHER 비율이 {Math.round(otherRatio * 100)}% 입니다 — 적합한 카테고리 추가 검토가 필요합니다.
        </p>
      )}
    </div>
  );
}

function pickBarColor(
  categoryValue: GlobalEventCategory,
  ratio: number,
  otherIsAbove: boolean,
): string {
  if (categoryValue === 'OTHER' && otherIsAbove) return WARN_BAR_COLOR;
  return NORMAL_BAR_COLOR;
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventCategoryStats.tsx
git commit -m "feat(frontend): 카테고리 분포 위젯 (OTHER ≥ 15% coral 경고)"
```

---

## Task 8: 페이지 3 개 (목록 / 생성 / 수정)

**Files:**
- Create: `frontend/apps/web/app/admin/global-events/page.tsx`
- Create: `frontend/apps/web/app/admin/global-events/new/page.tsx`
- Create: `frontend/apps/web/app/admin/global-events/[eventId]/edit/page.tsx`
- Create: `frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventsListPage.tsx`
- Create: `frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventNewPage.tsx`
- Create: `frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventEditPage.tsx`

- [ ] **Step 1: Server Component 진입점 3 개**

`page.tsx`:

```tsx
import { AdminGlobalEventsListPage } from './_pages/AdminGlobalEventsListPage';

export default function Page() {
  return <AdminGlobalEventsListPage />;
}
```

`new/page.tsx`:

```tsx
import { AdminGlobalEventNewPage } from '../_pages/AdminGlobalEventNewPage';

export default function Page() {
  return <AdminGlobalEventNewPage />;
}
```

`[eventId]/edit/page.tsx`:

```tsx
import { AdminGlobalEventEditPage } from '../../_pages/AdminGlobalEventEditPage';

export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <AdminGlobalEventEditPage eventId={Number(eventId)} />;
}
```

(Next 15 의 async params 패턴 — 다른 admin 페이지에서 사용 중인 형식과 일치시킴. notices 의 `[noticeId]/edit/page.tsx` 를 참고해 맞춤.)

- [ ] **Step 2: 목록 페이지 작성**

`_pages/AdminGlobalEventsListPage.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GlobalEventCategory } from '@duing/types';
import {
  useAdminGlobalEventDeleteMutation,
  useAdminGlobalEventListQuery,
} from '@duing/hooks';
import { AdminGlobalEventCategoryStats } from '../_components/AdminGlobalEventCategoryStats';
import { AdminGlobalEventDeleteDialog } from '../_components/AdminGlobalEventDeleteDialog';
import { AdminGlobalEventFilterBar } from '../_components/AdminGlobalEventFilterBar';
import { AdminGlobalEventTable } from '../_components/AdminGlobalEventTable';
import { Pagination } from '../../../notices/_components/Pagination';

const PAGE_SIZE = 20;

export function AdminGlobalEventsListPage() {
  const [category, setCategory] = useState<GlobalEventCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const listQuery = useAdminGlobalEventListQuery({
    category: category === 'ALL' ? undefined : category,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });
  const deleteMutation = useAdminGlobalEventDeleteMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">글로벌 이벤트 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            학교 단위 행사 일정을 등록·수정·삭제합니다. 캘린더에 즉시 반영됩니다.
          </p>
        </div>
        <Link
          href="/admin/global-events/new"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >
          + 새 이벤트
        </Link>
      </header>

      <div className="mb-6">
        <AdminGlobalEventCategoryStats />
      </div>

      <div className="mb-5">
        <AdminGlobalEventFilterBar
          category={category}
          keyword={keywordInput}
          onCategoryChange={(next) => {
            setCategory(next);
            setPage(0);
          }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => {
            setKeyword(keywordInput);
            setPage(0);
          }}
        />
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && (
        <AdminGlobalEventTable
          items={items}
          onDeleteClick={(id, title) => setDeleteTarget({ id, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <AdminGlobalEventDeleteDialog
        title={deleteTarget?.title ?? null}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
    </main>
  );
}
```

- [ ] **Step 3: 생성 페이지**

`_pages/AdminGlobalEventNewPage.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminGlobalEventCreateMutation } from '@duing/hooks';
import { AdminGlobalEventForm } from '../_components/AdminGlobalEventForm';
import { extractErrorMessage } from '../_lib/extractErrorMessage';
import {
  EMPTY_GLOBAL_EVENT_FORM,
  toCreatePayload,
} from '../_lib/parseGlobalEventFormState';

export function AdminGlobalEventNewPage() {
  const router = useRouter();
  const createMutation = useAdminGlobalEventCreateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">새 글로벌 이벤트</h1>
        <p className="mt-1 text-[13px] text-charcoal-3">
          캘린더 모든 사용자에게 노출됩니다 (비로그인 포함).
        </p>
      </header>
      <AdminGlobalEventForm
        mode="create"
        initialState={EMPTY_GLOBAL_EVENT_FORM}
        submitLabel="등록하기"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          createMutation.mutate(toCreatePayload(state), {
            onSuccess: () => router.push('/admin/global-events'),
            onError: async (error) => {
              const message = await extractErrorMessage(error);
              setErrorMessage(message ?? '등록에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: 수정 페이지**

`_pages/AdminGlobalEventEditPage.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAdminGlobalEventDetailQuery,
  useAdminGlobalEventUpdateMutation,
} from '@duing/hooks';
import { AdminGlobalEventForm } from '../_components/AdminGlobalEventForm';
import { extractErrorMessage } from '../_lib/extractErrorMessage';
import {
  fromDetail,
  toUpdatePayload,
} from '../_lib/parseGlobalEventFormState';

export function AdminGlobalEventEditPage({ eventId }: { eventId: number }) {
  const router = useRouter();
  const detailQuery = useAdminGlobalEventDetailQuery(eventId);
  const updateMutation = useAdminGlobalEventUpdateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (detailQuery.isLoading) {
    return <p className="px-10 py-12 text-charcoal-3 text-sm">불러오는 중…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="px-10 py-12 text-coral text-sm">이벤트를 불러오지 못했습니다.</p>;
  }

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">글로벌 이벤트 수정</h1>
      </header>
      <AdminGlobalEventForm
        mode="edit"
        initialState={fromDetail(detailQuery.data)}
        submitLabel="저장하기"
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          updateMutation.mutate(
            { eventId, payload: toUpdatePayload(state) },
            {
              onSuccess: () => router.push('/admin/global-events'),
              onError: async (error) => {
                const message = await extractErrorMessage(error);
                setErrorMessage(message ?? '저장에 실패했습니다.');
              },
            },
          );
        }}
      />
    </main>
  );
}
```

- [ ] **Step 5: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/page.tsx \
        frontend/apps/web/app/admin/global-events/new/page.tsx \
        frontend/apps/web/app/admin/global-events/[eventId]/edit/page.tsx \
        frontend/apps/web/app/admin/global-events/_pages/
git commit -m "feat(frontend): 어드민 글로벌 이벤트 목록·생성·수정 페이지"
```

---

## Task 9: 수동 시나리오 검증 + PR 준비

PR 머지 전 dev 서버에서 검증.

- [ ] **Step 1: Dev 서버 기동 + 브라우저 확인**

Run: `pnpm --filter web dev`
Open: `http://localhost:3000/admin/global-events`

확인 시나리오:
1. 사이드바에 "글로벌 이벤트" 항목 노출 + 클릭 시 목록 진입
2. 카테고리 분포 위젯 — 빈 상태일 때 6 카테고리 모두 0 으로 노출, 합계 0
3. + 새 이벤트 → 카테고리 placeholder "카테고리 선택" 비활성 옵션, 기본 미선택, OTHER 선택 시 ⚠️ 카피 노출
4. `linkUrl` 에 `javascript:alert(1)` 입력 → 폼 에러 노출 + 제출 차단
5. `endAt` 을 `startAt` 보다 이르게 → 폼 에러 노출
6. 정상 등록 → 목록 reroute, 분포 위젯 합계 +1
7. 수정 → 카테고리를 OTHER 로 변경 후 저장 → 분포 위젯 OTHER 카운트 증가
8. OTHER 가 전체의 15% 이상이 되면 OTHER 막대 color coral + 경고 카피 노출
9. 삭제 → 다이얼로그 → 목록·분포 동시 갱신
10. STUDENT 계정으로 `/admin/global-events` 진입 → `AdminRoleGuard` 의 "권한 필요" 화면 노출 (백엔드 403 fallback)

- [ ] **Step 2: 전체 lint/typecheck/build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: 모든 PASS.

- [ ] **Step 3: spec / PR 체크리스트 self-review**

1. spec §2.3 폼 필드·검증이 전부 구현됐는가
2. spec §2.4 의 카테고리 select 정책 (placeholder + OTHER 마지막 + OTHER 경고) 동작하는가
3. spec §2.5 의 분포 위젯이 독립 쿼리로 fetch 되고, mutation 후 자동 invalidate 되는가
4. spec §2.6 의 권한 가드가 동작하는가 (`AdminRoleGuard` 재사용)
5. 새 파일 안에 `any` / `as` / `useEffect` 데이터패칭 없는가
6. 커밋 메시지 Conventional Commits + Claude attribution 없는가
7. PR1 가 머지된 상태에서 작업 중인가 (백엔드 API 의존)

- [ ] **Step 4: PR 생성**

`feat/calendar-globalevent-admin-ui` 를 push → develop 대상 PR 생성. PR 본문 예시:

```
## 🚀 작업 내용
ADMIN 이 글로벌 이벤트를 등록·수정·삭제할 수 있는 어드민 UI 를 추가했습니다.
목록 페이지 상단에 카테고리 분포 위젯을 두어 OTHER 카테고리 남용을 시각적으로 모니터링할 수 있게 했습니다.

## 🤔 고민했던 내용
- 카테고리 select 의 placeholder 와 OTHER 마지막 배치는 ADMIN 이 무의식적으로 OTHER 를 고르는 일을 줄이기 위한 의도적 설계입니다. 추가로 OTHER 선택 즉시 경고 카피를 노출해 한 번 더 멈춰 생각하게 했습니다.
- 분포 위젯은 목록 필터/페이지와 분리된 별도 쿼리로 fetch 합니다. 검색 시에도 전체 분포가 보여야 운영자가 카테고리 분포를 판단할 수 있어서입니다.
- OTHER 비율 15% 임계는 임의 수치 — 운영 후 조정 예정 (spec Out of Scope 5 와 묶어 결정).

## 💬 리뷰 중점사항
- 분포 위젯의 invalidate 흐름 (`globalEventKeys.all` prefix 로 mutation 후 자동 갱신)
- 폼의 `linkUrl` zod regex 와 백엔드 `@Pattern` 정합
- `AdminRoleGuard` 재사용으로 별도 가드 추가 없는지
```

---

## Out of Scope (이 plan 에서 안 함)

- 캘린더 통합 (PR 3) — 별도 plan.
- OTHER 임계치 초과 시 알림/이메일 자동 발송 (spec §6 Out of Scope 5).
- 시계열 분포 비교 (spec §6 Out of Scope 10).
- 분포 위젯의 막대 차트화/시각적 강화 — MVP 는 텍스트 막대로 충분.
