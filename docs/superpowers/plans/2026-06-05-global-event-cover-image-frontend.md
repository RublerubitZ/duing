# PR2 — GlobalEvent 표지 이미지 프론트엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN 이 `/admin/global-events` 폼에서 `GlobalEventCoverUploader` 를 통해 표지 이미지를 업로드·교체·제거할 수 있고, 학생이 `/calendar` detail 모달에서 이미지를 시청할 수 있는 UI 통합.

**Architecture:** PR1 백엔드 API 와 정합하는 타입/스키마 확장. URL 직접 입력 텍스트 input 은 노출하지 않고 `NoticeCoverUploader` 패턴을 그대로 차용한 `GlobalEventCoverUploader` 만 제공 — 사용자는 URL 문자열을 인지하지 않는다. `toUpdatePayload` 가 `initialCoverImageUrl` 인자를 추가로 받아 변경 감지 후 `coverImageUrl` 과 `clearCoverImage` 중 하나만 set (둘 다 set 되지 않는 invariant).

**Tech Stack:** Next.js 15 · React 19 · TanStack Query v5 · zod · `@duing/types|schemas|api|hooks`.

**브랜치:** `feat/global-event-cover-image-frontend` (develop 분기). **선행 의존:** PR1 백엔드 머지 완료.

**spec 참조:** [`docs/superpowers/specs/2026-06-05-global-event-cover-image.md`](../specs/2026-06-05-global-event-cover-image.md) §2.

---

## 사전 컨벤션 (모든 task 공통)

- 타입 `type` (interface 금지). `any` / `as` 단언 금지.
- 변수명 풀네임 (`coverImageUrl`, `initialCoverImageUrl`, `uploadMutation` — `url`, `init`, `mut` 금지).
- 커밋 메시지 Conventional Commits (`feat(frontend): ...`). `[#이슈번호]` 금지. Claude attribution 금지.
- 빌드 검증: `cd frontend && pnpm --filter web typecheck` 후 마지막 task 에서 `pnpm --filter web build`.

---

## File Structure (전체 PR 산출물)

**수정**
```
frontend/packages/types/src/
└── globalEvent.ts                                     # coverImageUrl + clearCoverImage 추가

frontend/packages/schemas/src/
└── index.ts                                           # create/updateGlobalEventSchema 확장

frontend/apps/web/app/admin/global-events/
├── _lib/parseGlobalEventFormState.ts                  # coverImageUrl 필드 + toUpdatePayload 시그니처
├── _components/AdminGlobalEventForm.tsx               # Uploader wiring
└── _pages/AdminGlobalEventEditPage.tsx                # toUpdatePayload 호출에 initialCoverImageUrl 전달

frontend/apps/web/app/calendar/_components/
└── EventDetailModal.tsx                               # GlobalDetailSection 이미지 렌더
```

**신규**
```
frontend/apps/web/app/admin/global-events/_components/
└── GlobalEventCoverUploader.tsx                       # NoticeCoverUploader 패턴 복제
```

---

## Task 1: 타입 확장

`@duing/types` 의 `globalEvent.ts` 에 `coverImageUrl` (Detail / Payload) + `clearCoverImage` (Update Payload) 필드 추가. Card / Summary 타입은 손대지 않음 (백엔드와 정합 — Card 응답 경량화).

**Files:**
- Modify: `frontend/packages/types/src/globalEvent.ts`

- [ ] **Step 1: 4 타입에 `coverImageUrl` 추가**

`Read` 로 현재 파일 확인. `GlobalEventDetail` / `AdminGlobalEventDetail` / `CreateGlobalEventPayload` 의 `linkUrl` 다음에 추가, `UpdateGlobalEventPayload` 에는 `clearCoverImage` 도 추가.

`GlobalEventDetail`:
```ts
export type GlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  coverImageUrl: string | null;        // 추가
  category: GlobalEventCategory;
};
```

`AdminGlobalEventDetail`:
```ts
export type AdminGlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  coverImageUrl: string | null;        // 추가
  category: GlobalEventCategory;
  createdBy: AdminGlobalEventCreator;
  createdAt: string;
  updatedAt: string;
};
```

`CreateGlobalEventPayload`:
```ts
export type CreateGlobalEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  linkUrl?: string;
  coverImageUrl?: string;              // 추가
  category: GlobalEventCategory;
};
```

`UpdateGlobalEventPayload` — 기존 `Partial<CreateGlobalEventPayload>` 에 `clearCoverImage` 합치기:
```ts
export type UpdateGlobalEventPayload = Partial<CreateGlobalEventPayload> & {
  clearCoverImage?: boolean;           // 추가
};
```

**Card/Summary 타입은 그대로 — `GlobalEventCard` / `AdminGlobalEventSummary` 손대지 않음.**

- [ ] **Step 2: 타입체크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/types typecheck
```
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/globalEvent.ts
git commit -m "feat(frontend): GlobalEvent 타입에 coverImageUrl + clearCoverImage 추가"
```

---

## Task 2: zod 스키마 확장

`createGlobalEventSchema` / `updateGlobalEventSchema` 에 `coverImageUrl` 필드 추가. update 에는 `clearCoverImage` 도. `@Pattern` 적용 안 함 (Supabase Storage URL 다양한 호스트).

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: `createGlobalEventSchema` 에 `coverImageUrl` 추가**

`Read` 로 정확한 위치 확인 후 `linkUrl` 정의 다음에 추가:

```ts
linkUrl: z
  .string()
  .max(500, '링크는 500자 이하여야 합니다.')
  .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
  .optional()
  .or(z.literal('')),
coverImageUrl: z                                                      // 추가
  .string()
  .max(500, '이미지 URL 은 500자 이하여야 합니다.')
  .optional()
  .or(z.literal('')),
category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER'], {
  errorMap: () => ({ message: '카테고리를 선택해주세요.' }),
}),
```

- [ ] **Step 2: `updateGlobalEventSchema` 에 `coverImageUrl` + `clearCoverImage` 추가**

`linkUrl` 정의 다음에 추가:

```ts
linkUrl: z
  .string()
  .max(500)
  .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
  .optional()
  .or(z.literal('')),
coverImageUrl: z                                                      // 추가
  .string()
  .max(500, '이미지 URL 은 500자 이하여야 합니다.')
  .optional()
  .or(z.literal('')),
clearCoverImage: z.boolean().optional(),                              // 추가
category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER']).optional(),
```

- [ ] **Step 3: 타입체크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/schemas typecheck
```
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): create/updateGlobalEventSchema 에 coverImageUrl 추가"
```

---

## Task 3: 폼 상태 파서 확장 (`coverImageUrl` 필드 + `toUpdatePayload` 시그니처)

`GlobalEventFormState` 에 `coverImageUrl` 추가. `fromDetail` / `toCreatePayload` 갱신. **`toUpdatePayload` 가 `initialCoverImageUrl: string` 두 번째 인자를 받고**, 변경 감지 후 `coverImageUrl` 과 `clearCoverImage` 중 하나만 set (둘 다 set 되지 않는 invariant).

**Files:**
- Modify: `frontend/apps/web/app/admin/global-events/_lib/parseGlobalEventFormState.ts`

- [ ] **Step 1: `GlobalEventFormState` + `EMPTY_GLOBAL_EVENT_FORM` 확장**

```ts
export type GlobalEventFormState = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  linkUrl: string;
  coverImageUrl: string;              // 추가
  category: GlobalEventCategory | '';
};

export const EMPTY_GLOBAL_EVENT_FORM: GlobalEventFormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  location: '',
  linkUrl: '',
  coverImageUrl: '',                  // 추가
  category: '',
};
```

- [ ] **Step 2: `fromDetail` 확장**

```ts
export function fromDetail(detail: AdminGlobalEventDetail): GlobalEventFormState {
  return {
    title: detail.title,
    description: detail.description ?? '',
    startAt: toLocal(detail.startAt),
    endAt: toLocal(detail.endAt),
    location: detail.location ?? '',
    linkUrl: detail.linkUrl ?? '',
    coverImageUrl: detail.coverImageUrl ?? '',     // 추가
    category: detail.category,
  };
}
```

- [ ] **Step 3: `toCreatePayload` 에 `coverImageUrl` 추가**

기존 패턴 (`state.X ? state.X : undefined`) 그대로 적용:

```ts
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
    coverImageUrl: state.coverImageUrl ? state.coverImageUrl : undefined,   // 추가
    category: state.category,
  };
}
```

- [ ] **Step 4: `toUpdatePayload` 시그니처 확장 + invariant 구현**

기존 `toUpdatePayload(state)` 시그니처를 다음으로 교체:

```ts
/**
 * 폼 상태 → PATCH 요청 payload.
 *
 * 빈 문자열(`""`) 은 의도된 "필드 비우기" 신호로 그대로 백엔드에 전달한다 (description/location/linkUrl).
 * 백엔드 `GlobalEvent.update` 가 null(=skip) 과 빈 문자열(=clear) 을 구분하므로,
 * `toCreatePayload` 처럼 `'' → undefined` 변환하면 안 됨.
 *
 * coverImageUrl 처리 — `Club.clearCollege` 패턴:
 * - 폼 state.coverImageUrl 이 initialCoverImageUrl 과 동일 → 변경 없음, 두 필드 모두 undefined
 * - state.coverImageUrl 이 새 값 (non-empty, 다름) → coverImageUrl 만 set
 * - state.coverImageUrl 이 '' (제거 의도) → clearCoverImage: true 만 set
 *
 * **Invariant: coverImageUrl 과 clearCoverImage 는 동시에 set 되지 않는다.**
 */
export function toUpdatePayload(
  state: GlobalEventFormState,
  initialCoverImageUrl: string,
): UpdateGlobalEventPayload {
  const payload: UpdateGlobalEventPayload = {
    title: state.title.trim(),
    description: state.description,
    startAt: state.startAt ? toLocalDateTime(state.startAt) : undefined,
    endAt: state.endAt ? toLocalDateTime(state.endAt) : undefined,
    location: state.location,
    linkUrl: state.linkUrl,
  };
  if (state.category !== '') payload.category = state.category;

  // coverImageUrl 변경 감지 — initial 과 동일하면 둘 다 미설정 (유지).
  if (state.coverImageUrl !== initialCoverImageUrl) {
    if (state.coverImageUrl === '') {
      payload.clearCoverImage = true;
    } else {
      payload.coverImageUrl = state.coverImageUrl;
    }
  }

  return payload;
}
```

- [ ] **Step 5: 타입체크 (단, edit page 호출자 깨짐 예상)**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck 2>&1 | head -10
```

Expected: `AdminGlobalEventEditPage.tsx` 에서 `toUpdatePayload(state)` 인자 부족 에러. Task 5 에서 정식화 — 의도된 transition fail.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_lib/parseGlobalEventFormState.ts
git commit -m "feat(frontend): parseGlobalEventFormState 에 coverImageUrl + initialCoverImageUrl 감지"
```

---

## Task 4: `GlobalEventCoverUploader` 컴포넌트 신규

`NoticeCoverUploader` 의 패턴을 복제. `purpose: 'GLOBAL_EVENT_COVER'` + alt 텍스트 "표지 이미지" + placeholder 카피.

**Files:**
- Create: `frontend/apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useRef } from 'react';
import { useFileUploadMutation } from '@duing/hooks';

type Props = {
  value: string;
  onChange: (url: string) => void;
};

export function GlobalEventCoverUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (file: File) => {
    const result = await uploadMutation.mutateAsync({ file, purpose: 'GLOBAL_EVENT_COVER' });
    onChange(result.url);
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-graysoft border border-line">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
          <img src={value} alt="표지 이미지" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px]">
            표지 이미지를 업로드하세요 (선택)
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(changeEvent) => {
            const file = changeEvent.target.files?.[0];
            if (file) void handleSelect(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
        >
          {uploadMutation.isPending ? '업로드 중…' : value ? '교체' : '업로드'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-md text-[13px] text-charcoal-2 hover:bg-graysoft"
          >
            제거
          </button>
        )}
      </div>
      {uploadMutation.isError && (
        <p className="text-red-500 text-[12px]">업로드 실패. 다시 시도해주세요.</p>
      )}
    </div>
  );
}
```

> `useFileUploadMutation` 의 `purpose` 인자가 `'GLOBAL_EVENT_COVER'` 를 받으려면 백엔드 PR1 의 `FilePurpose` enum 확장이 머지된 상태여야 함 (선행 의존 충족 확인). 프론트 클라이언트의 `purpose` 타입이 백엔드 응답 기반이 아니라 string literal union 으로 정의된 경우 별도 타입 확장이 필요할 수 있음 — `useFileUploadMutation` 시그니처 확인.

- [ ] **Step 2: `useFileUploadMutation` 의 purpose 타입 확인**

```bash
grep -n "purpose" /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/packages/hooks/src/files.ts
grep -n "FilePurpose\|purpose" /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/packages/api/src/client.ts | head -10
grep -rn "FilePurpose\|FileUploadPayload" /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/packages/types/src/ | head -5
```

`purpose` 가 string literal union 으로 타입 정의돼 있다면 `'GLOBAL_EVENT_COVER'` 를 추가. 단순 `string` 타입이면 코드 변경 없음.

- [ ] **Step 3: (조건부) FilePurpose 타입 확장**

만약 위 grep 결과 `purpose: 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'PROMOTION_BANNER'` 같은 union 이면 `'GLOBAL_EVENT_COVER'` 추가:

```ts
// frontend/packages/types/src/file.ts (또는 client 안)
export type FilePurpose =
  | 'LOGO'
  | 'COVER'
  | 'PHOTO'
  | 'NOTICE_COVER'
  | 'PROMOTION_BANNER'
  | 'GLOBAL_EVENT_COVER';    // 추가
```

만약 `purpose: string` 이라면 이 step 건너뛰기. (양쪽 다 가능 — 코드베이스 확인 후 결정.)

- [ ] **Step 4: 타입체크**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 신규 파일 자체 에러 없어야 함. `AdminGlobalEventEditPage` 의 `toUpdatePayload` 호출 에러는 Task 5 책임 (잔존 OK).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_components/GlobalEventCoverUploader.tsx
# Step 3 가 적용됐다면:
# git add frontend/packages/types/src/file.ts (또는 해당 경로)
git commit -m "feat(frontend): GlobalEventCoverUploader 컴포넌트 추가"
```

---

## Task 5: `AdminGlobalEventForm` 에 Uploader wiring + Edit page 호출자 갱신

폼에 Uploader 추가 + `AdminGlobalEventEditPage` 의 `toUpdatePayload(state)` 호출에 `detailQuery.data.coverImageUrl ?? ''` 두 번째 인자 전달.

**Files:**
- Modify: `frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx`
- Modify: `frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventEditPage.tsx`

- [ ] **Step 1: `AdminGlobalEventForm` 에 Uploader Field 추가**

`Read` 로 현재 폼 확인. 카테고리 select Field 바로 위 (또는 첫 번째 Field 로) `<Field label="표지 이미지 (선택)">` 추가:

```tsx
import { GlobalEventCoverUploader } from './GlobalEventCoverUploader';

// ... 폼 안 (카테고리 select 위)
<Field label="표지 이미지 (선택)" error={fieldErrors.coverImageUrl}>
  <GlobalEventCoverUploader
    value={state.coverImageUrl}
    onChange={(url) => update('coverImageUrl', url)}
  />
</Field>
```

**URL 직접 입력 텍스트 input 은 노출하지 않음** — 사용자는 업로드/교체/제거 버튼만 인지.

- [ ] **Step 2: `AdminGlobalEventEditPage` 의 `toUpdatePayload` 호출 갱신**

`Read` 로 현재 호출 위치 확인 후 `initialCoverImageUrl` 두 번째 인자 추가:

```tsx
updateMutation.mutate(
  {
    eventId,
    payload: toUpdatePayload(state, detailQuery.data.coverImageUrl ?? ''),
  },
  {
    onSuccess: () => router.push(toRoute('/admin/global-events')),
    onError: (error) => {
      const message = extractErrorMessage(error);
      setErrorMessage(message ?? '저장에 실패했습니다.');
    },
  },
);
```

> `detailQuery.data.coverImageUrl` 는 `string | null` — `?? ''` 로 빈 문자열 normalize. 그렇지 않으면 `null !== ''` 이라 항상 변경 감지됨.

- [ ] **Step 3: `AdminGlobalEventNewPage` 영향 확인 (변경 없음)**

`toCreatePayload(state)` 는 시그니처 변경 없음. Create 페이지는 추가 인자 불필요. `Read` 로 확인만.

```bash
grep -n "toCreatePayload\|toUpdatePayload" /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventNewPage.tsx
```

- [ ] **Step 4: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck && pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/global-events/_components/AdminGlobalEventForm.tsx \
        frontend/apps/web/app/admin/global-events/_pages/AdminGlobalEventEditPage.tsx
git commit -m "feat(frontend): 어드민 GlobalEvent 폼에 표지 이미지 업로더 wiring"
```

---

## Task 6: 캘린더 detail 모달에 이미지 렌더

PR #241 의 `EventDetailModal.tsx` 안의 `GlobalDetailSection` 컴포넌트가 description 위에 cover 이미지를 렌더하도록 추가.

**Files:**
- Modify: `frontend/apps/web/app/calendar/_components/EventDetailModal.tsx`

- [ ] **Step 1: `GlobalDetailSection` 에 이미지 렌더 블록 추가**

`Read` 로 현재 `GlobalDetailSection` 함수 확인. 성공 분기의 return 안에서 `description` p 태그 **위**에 이미지 영역 추가:

```tsx
function GlobalDetailSection({ eventId }: { eventId: number }) {
  const detailQuery = useGlobalEventDetailQuery(eventId);

  if (detailQuery.isLoading) {
    return <p className="text-[13px] text-charcoal-3">상세 정보를 불러오는 중…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-[13px] text-coral">상세 정보를 불러오지 못했습니다.</p>;
  }
  const detail = detailQuery.data;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {detail.coverImageUrl && (                                       // 추가
        <div className="aspect-[16/9] rounded-lg overflow-hidden bg-graysoft">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
          <img
            src={detail.coverImageUrl}
            alt={detail.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {detail.description && (
        <p className="text-[13.5px] text-charcoal whitespace-pre-wrap">{detail.description}</p>
      )}
      {detail.linkUrl && (
        <a
          href={detail.linkUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] text-ink font-semibold underline"
        >
          자세히 보기 ↗
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 빌드**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck && pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/calendar/_components/EventDetailModal.tsx
git commit -m "feat(frontend): EventDetailModal 의 GlobalDetailSection 에 표지 이미지 렌더"
```

---

## Task 7: 수동 시나리오 검증 + PR 준비

`pnpm --filter web dev` 로 서버 띄우고 다음 7 시나리오 확인.

- [ ] **Step 1: 전체 lint/typecheck/build**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm lint && pnpm typecheck && pnpm build
```
Expected: 모두 PASS.

- [ ] **Step 2: Dev 서버 + 시나리오**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web dev
```

확인 시나리오 (백엔드 PR1 가 머지된 develop 환경이 떠 있어야 함):

| # | 시나리오 | 기대 동작 |
|---|---|---|
| 1 | ADMIN 으로 `/admin/global-events/new` 진입 → 이미지 업로드 후 등록 | DB 에 `cover_image_url` 저장. 학생 캘린더 detail 모달에서 이미지 노출 |
| 2 | 이미지 없는 GlobalEvent 등록 | 모달 detail 에 이미지 영역 자체 안 그림 (description / linkUrl 만) |
| 3 | 기존 이미지 있는 이벤트 수정 → "교체" → 새 이미지 업로드 → 저장 | PATCH payload 에 `coverImageUrl: '<new>'`, `clearCoverImage: undefined`. DB 갱신 후 모달 새 이미지 노출 |
| 4 | 기존 이미지 있는 이벤트 수정 → "제거" 버튼 → 저장 | PATCH payload 에 `coverImageUrl: undefined`, `clearCoverImage: true`. DB 에서 null 저장. 모달 detail 에 이미지 영역 사라짐 |
| 5 | 기존 이미지 있는 이벤트 수정 → title 만 변경 → 저장 | PATCH payload 에 `coverImageUrl`, `clearCoverImage` 둘 다 누락. DB 의 cover_image_url 유지. 모달 변화 없음 |
| 6 | 어드민 목록(GE-3) / 공개 윈도우(GE-1) 응답 — 네트워크 탭 확인 | 응답에 `coverImageUrl` 필드 **없음** (Card / Summary 응답 미변경 확인) |
| 7 | 공개 detail(GE-2) / 어드민 detail(GE-4) 응답 | 응답에 `coverImageUrl` 필드 **있음** (이미지 등록 케이스만 non-null) |

각 시나리오의 네트워크 탭에서 PATCH 요청 body 를 확인해 `coverImageUrl` 과 `clearCoverImage` 가 **동시에 set 되지 않는 invariant** 가 지켜지는지 검증.

- [ ] **Step 3: spec / PR 체크리스트 self-review**

1. spec §2.1 타입 4 곳 확장 완료 (Detail 2 개 + Payload 2 개)
2. spec §2.2 스키마 2 개 확장 (`coverImageUrl` + Update 의 `clearCoverImage`)
3. spec §2.4 `toUpdatePayload(state, initialCoverImageUrl)` 시그니처 + invariant 구현
4. spec §2.5 `GlobalEventCoverUploader` 신규 컴포넌트 (NoticeCoverUploader 복제 + alt/placeholder 만 변경)
5. spec §2.6 폼에 URL 텍스트 input 없음, Uploader 만
6. spec §2.7 모달에 cover 이미지 렌더 (description 위, aspect-[16/9])
7. Conventional Commits + Claude attribution 없음

- [ ] **Step 4: PR 생성 안내 (수동)**

`feat/global-event-cover-image-frontend` push + develop 대상 PR. 본문:

```
## 🚀 작업 내용
PR1 백엔드의 coverImageUrl 필드를 어드민 폼 + 캘린더 detail 모달에 wiring 했습니다. URL 직접 입력은 폐지하고 NoticeCoverUploader 패턴을 복제한 GlobalEventCoverUploader 만 노출합니다. PATCH 시 coverImageUrl 과 clearCoverImage 는 mutually exclusive — toUpdatePayload 가 initialCoverImageUrl 과 비교해 둘 중 하나만 set 합니다.

## 🤔 고민했던 내용
- toUpdatePayload 의 시그니처 확장: 변경 감지를 위해 initialCoverImageUrl 두 번째 인자 추가. Edit 페이지가 detail fetch 후 함께 전달.
- 다른 도메인 URL 입력 정책: 본 PR 은 GlobalEvent 만 적용. Notice / Promotion / Banner 통합은 후속 리팩토링 spec.
- 이미지 로드 실패 fallback / 업로드 형식 검증: 본 PR 범위 밖 (spec §5 Out of Scope) — <ImageWithFallback> 공통 컴포넌트 + FileController 검증 통합 spec 으로 분리.

## 💬 리뷰 중점사항
- toUpdatePayload 의 invariant (coverImageUrl 과 clearCoverImage 동시 set 안 됨) 가 모든 분기에서 지켜지는지
- AdminGlobalEventNewPage 의 toCreatePayload 호출이 변경 없음 (시그니처 동일)
- Card / Summary 응답에 coverImageUrl 없음 확인 — 네트워크 탭으로 검증
```

---

## Out of Scope (이 plan 에서 안 함)

- Storage orphan 파일 정리 (spec §5.1)
- 다중 이미지 갤러리 (spec §5.2)
- 캘린더 그리드 셀 썸네일 (spec §5.3)
- 업로드 형식/용량 검증 (spec §5.6 — 후속 통합 리팩토링 spec)
- `<ImageWithFallback>` 공통 컴포넌트 (spec §5.7 — 후속 통합 리팩토링 spec)
- 다른 도메인 URL 입력 통합 (spec §5.9)
- 이미지 업로드 진행률 (spec §5.10)
- next/image 도입 (spec §5.11)