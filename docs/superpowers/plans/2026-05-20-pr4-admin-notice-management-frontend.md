# P4 — 프론트엔드 `/admin/notices` 관리 화면 + 알림 페이지 BROADCAST UI 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P1·P2 의 백엔드 API 와 P3 의 공개 피드에 이어, 총동연(ADMIN) 이 공지를 작성·수정·삭제할 수 있는 `/admin/notices` 관리 화면을 신설한다. 그리고 알림 페이지/벨에서 `source: PERSONAL | BROADCAST` 디스크리미네이터 기반 시각 차별 + broadcast 읽음 PATCH 와이어링을 마무리한다.

**Architecture:** Next.js 15 App Router. `/admin/notices` 는 기존 `AdminRoleGuard` 아래 동작 (`/admin/clubs` 패턴 차용). 작성/수정 폼은 단일 `NoticeForm` 컴포넌트로 공유, 페이지는 mutation 만 다르게 주입. Visibility=CLUB_SCOPED 분기 폼은 `VisibilityPicker` sub-form 으로 캡슐화. 마크다운 작성은 textarea + 라이브 프리뷰 (이미 설치된 `react-markdown` 재사용 — 별도 에디터 의존성 추가 없음). 알림 페이지는 기존 코드를 최소 변경으로 source-aware 처리.

**Tech Stack:** Next.js 15 / React 19 / TanStack Query v5 / Zustand / Tailwind / Vitest / Spring Boot 3.4 (백엔드 작은 enum 1건만)

**Spec reference:** `docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md` (§ 5.4 admin 목록 · § 5.5 작성/수정 폼 · § 5.6 알림 페이지 broadcast 통합)

**Backend ready:**
- P1 (#121): `POST/PATCH/DELETE /admin/notices`, `GET /admin/notices`, `GET /admin/notices/{id}`
- P2 (#122): `PATCH /me/notifications/broadcasts/{id}/read`

**Branch:** `feat/admin-notice-management`

**Out of Scope (이 PR 아님)**
- 수신자 사전 카운트 API/UI (제출 전 표시 없음 — 2000명 초과 응답은 토스트로 안내)
- 첨부 파일 (대표 이미지 외)
- 공지 댓글/반응
- 무한 스크롤 (admin 목록도 offset 페이지네이션)
- 카테고리 enum → 테이블화 (D, 보류)
- 공지 통계 (노출수·클릭수)
- `@uiw/react-md-editor` 도입 (간이 textarea + 미리보기로 대체)

---

## File Structure

```
backend/src/main/java/com/duing/global/file/controller/dto/
  FilePurpose.java                                  [수정] NOTICE_COVER 값 추가

frontend/packages/types/src/
  club.ts                                           [수정] FilePurpose 에 NOTICE_COVER 추가

frontend/packages/api/src/
  client.ts                                         [수정] admin.notices 블록 추가

frontend/packages/hooks/src/
  notices.ts                                        [수정] admin list/detail query + create/update/delete/markBroadcastRead mutation 추가
  noticeQueryKeys.ts                                [수정] adminList / adminDetail 키 추가
  notifications.ts                                  [수정] source-aware read mutation (BROADCAST 분기)

frontend/apps/web/app/admin/notices/
  page.tsx                                          [신규] 관리 목록 (Server -> Client 조립)
  new/page.tsx                                      [신규] 작성 페이지
  [noticeId]/edit/page.tsx                          [신규] 수정 페이지
  _pages/
    AdminNoticesListPage.tsx                        [신규] 목록 컨테이너
    AdminNoticeNewPage.tsx                          [신규] 작성 컨테이너
    AdminNoticeEditPage.tsx                         [신규] 수정 컨테이너
  _components/
    AdminNoticesTable.tsx                           [신규] 테이블 행
    AdminNoticesFilterBar.tsx                       [신규] visibility/keyword/만료 토글
    AdminNoticeDeleteDialog.tsx                     [신규] 삭제 확인
    NoticeForm.tsx                                  [신규] 공유 폼
    VisibilityPicker.tsx                            [신규] CLUB_SCOPED sub-form
    NoticeCoverUploader.tsx                         [신규] 대표 이미지 업로드
    NoticeMarkdownEditor.tsx                        [신규] textarea + 라이브 프리뷰
    NoticeTagInput.tsx                              [신규] 태그 chip 입력
  _lib/
    visibilityLabels.ts                             [신규]
    parseNoticeFormState.ts                         [신규] form ↔ command 변환 헬퍼

frontend/apps/web/app/notifications/
  page.tsx                                          [수정] BROADCAST source chip + source-aware read
  _components/NotificationItem.tsx                  [수정] BROADCAST chip + source-aware onClick

frontend/apps/web/app/_components/
  NotificationBell.tsx                              [수정] BROADCAST chip + source-aware read mutation

frontend/apps/web/test/admin/notices/
  list.test.tsx                                     [신규]
  form.test.tsx                                     [신규]
frontend/apps/web/test/notifications/
  broadcast-read.test.tsx                           [신규]
```

---

## Task 1 — 백엔드 `FilePurpose.NOTICE_COVER` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`

- [ ] **Step 1: enum 값 추가**

기존 3개 값 뒤에 한 줄 추가:

```java
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover");
    // ...
}
```

기존 생성자/`directory()` 메서드는 그대로.

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java
git commit -m "feat(backend): FilePurpose 에 NOTICE_COVER 값 추가"
```

(no Claude attribution)

---

## Task 2 — 프론트 타입에 `NOTICE_COVER` 반영

**Files:**
- Modify: `frontend/packages/types/src/club.ts`

- [ ] **Step 1: FilePurpose 타입 갱신**

기존 `export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO';` 를:

```ts
export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER';
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/types build
git add frontend/packages/types/src/club.ts
git commit -m "feat(frontend): FilePurpose 에 NOTICE_COVER 추가"
```

---

## Task 3 — API 클라이언트에 admin.notices 블록 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 인터페이스 확장**

기존 `admin: { clubs, users }` 객체에 `notices` 추가:

```ts
admin: {
  clubs: { /* 기존 */ };
  users: { /* 기존 */ };
  notices: {
    list(params: {
      category?: NoticeCategory;
      visibility?: NoticeVisibility;
      keyword?: string;
      includeExpired?: boolean;
      page: number;
      size: number;
    }): Promise<PageResponse<AdminNoticeSummary>>;
    detail(noticeId: number): Promise<NoticeDetail>;
    create(payload: CreateNoticePayload): Promise<number>;
    update(noticeId: number, payload: UpdateNoticePayload): Promise<void>;
    remove(noticeId: number): Promise<void>;
  };
};
```

타입은 `@duing/types` 의 `notice.ts` 에 `AdminNoticeSummary`, `CreateNoticePayload`, `UpdateNoticePayload` 가 추가돼야 한다 — 본 task 시작 전에 `notice.ts` 를 다음과 같이 확장한다:

```ts
// notice.ts 끝에 추가
export type AdminNoticeSummary = {
  id: number;
  title: string;
  category: NoticeCategory;
  visibility: NoticeVisibility;
  pinned: boolean;
  notifyOnPublish: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export type CreateNoticePayload = {
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  pinned: boolean;
  expiresAt: string | null;
  notifyOnPublish: boolean;
};

export type UpdateNoticePayload = Partial<Omit<CreateNoticePayload, 'targetClubIds'>> & {
  targetClubIds?: number[];
  clearExpiresAt?: boolean;
};
```

- [ ] **Step 2: 구현 추가 — 인스턴스 메서드**

기존 `admin.clubs` 와 `admin.users` 다음에 `notices` 블록 추가:

```ts
notices: {
  list: (params) => {
    const search = new URLSearchParams();
    search.append('page', String(params.page));
    search.append('size', String(params.size));
    if (params.category) search.append('category', params.category);
    if (params.visibility) search.append('visibility', params.visibility);
    if (params.keyword) search.append('keyword', params.keyword);
    if (params.includeExpired) search.append('includeExpired', 'true');
    return jsonOk<PageResponse<AdminNoticeSummary>>(
      http.get(`admin/notices?${search.toString()}`),
    );
  },
  detail: (noticeId) =>
    jsonOk<NoticeDetail>(http.get(`admin/notices/${noticeId}`)),
  create: (payload) =>
    jsonOk<number>(http.post('admin/notices', { json: payload })),
  update: (noticeId, payload) =>
    jsonVoid(http.patch(`admin/notices/${noticeId}`, { json: payload })),
  remove: (noticeId) =>
    jsonVoid(http.delete(`admin/notices/${noticeId}`)),
},
```

(타입 import 와 `jsonOk` / `jsonVoid` 헬퍼는 기존 사용 패턴 동일.)

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/types build && pnpm --filter @duing/api build
git add frontend/packages/types/src/notice.ts frontend/packages/api/src/client.ts
git commit -m "feat(frontend): admin notices API 클라이언트 메서드 추가"
```

---

## Task 4 — React Query 훅 (admin list/detail + create/update/delete + broadcast read)

**Files:**
- Modify: `frontend/packages/hooks/src/notices.ts`
- Modify: `frontend/packages/hooks/src/noticeQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/notifications.ts`

- [ ] **Step 1: `noticeQueryKeys.ts` 확장**

```ts
import type { NoticeCategory, NoticeVisibility } from '@duing/types';

type ListFilters = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

type AdminListFilters = {
  category?: NoticeCategory;
  visibility?: NoticeVisibility;
  keyword?: string;
  includeExpired?: boolean;
  page: number;
  size: number;
};

export const noticeQueryKeys = {
  all: ['notices'] as const,
  list: (filters: ListFilters) => ['notices', 'list', filters] as const,
  detail: (noticeId: number) => ['notices', 'detail', noticeId] as const,
  adminList: (filters: AdminListFilters) => ['notices', 'admin', 'list', filters] as const,
  adminDetail: (noticeId: number) => ['notices', 'admin', 'detail', noticeId] as const,
};
```

- [ ] **Step 2: `notices.ts` 확장 (기존 두 훅 유지)**

기존 `useNoticeListQuery` / `useNoticeDetailQuery` 아래에 5개 훅 추가:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateNoticePayload, NoticeCategory, NoticeVisibility, UpdateNoticePayload,
} from '@duing/types';

type AdminListParams = {
  category?: NoticeCategory;
  visibility?: NoticeVisibility;
  keyword?: string;
  includeExpired?: boolean;
  page: number;
  size: number;
};

export function useAdminNoticeListQuery(params: AdminListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.adminList(params),
    queryFn: () => client.admin.notices.list(params),
    enabled,
    staleTime: 15_000,
  });
}

export function useAdminNoticeDetailQuery(noticeId: number | null, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.adminDetail(noticeId ?? -1),
    queryFn: () => {
      if (noticeId === null) throw new Error('noticeId is null but query is enabled');
      return client.admin.notices.detail(noticeId);
    },
    enabled: enabled && noticeId !== null,
    staleTime: 15_000,
  });
}

export function useAdminNoticeCreateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateNoticePayload) => client.admin.notices.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
    },
  });
}

export function useAdminNoticeUpdateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, payload }: { noticeId: number; payload: UpdateNoticePayload }) =>
      client.admin.notices.update(noticeId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.adminDetail(variables.noticeId) });
    },
  });
}

export function useAdminNoticeDeleteMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => client.admin.notices.remove(noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeQueryKeys.all });
    },
  });
}
```

- [ ] **Step 3: `notifications.ts` 에 source-aware read 추가**

기존 `useNotificationReadMutation` 옆에 신규 mutation 추가:

```ts
import type { NotificationSource } from '@duing/types';

export function useNotificationSourceAwareReadMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, id }: { source: NotificationSource; id: number }) => {
      if (source === 'BROADCAST') {
        return client.notifications.markBroadcastRead(id);
      }
      return client.notifications.markRead(id);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}
```

또한 클라이언트에 `markBroadcastRead` 메서드가 없다면 Task 3 의 client.ts 수정에 함께 추가 (notifications 블록 안):

```ts
markBroadcastRead(broadcastId: number): Promise<void>;
// 구현:
markBroadcastRead: (broadcastId) =>
  jsonVoid(http.patch(`me/notifications/broadcasts/${broadcastId}/read`)),
```

(Task 3 step 2 코드 블록에 markBroadcastRead 한 줄 추가하는 것을 잊지 말 것.)

- [ ] **Step 4: 빌드 + 커밋**

```bash
pnpm --filter @duing/hooks build
git add frontend/packages/hooks/src/
git commit -m "feat(frontend): admin notice CRUD 훅 + source-aware 알림 읽음 mutation 추가"
```

---

## Task 5 — `visibilityLabels.ts` + `parseNoticeFormState.ts` 유틸

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_lib/visibilityLabels.ts`
- Create: `frontend/apps/web/app/admin/notices/_lib/parseNoticeFormState.ts`

- [ ] **Step 1: `visibilityLabels.ts`**

```ts
import type { NoticeVisibility, NoticeClubScopeRole } from '@duing/types';

export const VISIBILITY_LABEL: Record<NoticeVisibility, string> = {
  PUBLIC: '전체 공개',
  OFFICERS_ALL: '전 동아리 운영진',
  CLUB_SCOPED: '특정 동아리',
};

export const CLUB_SCOPE_ROLE_LABEL: Record<NoticeClubScopeRole, string> = {
  OFFICERS_ONLY: '해당 동아리 운영진만',
  ALL_MEMBERS: '해당 동아리 멤버 전원',
};
```

- [ ] **Step 2: `parseNoticeFormState.ts`**

폼 state 모델 + payload 변환 헬퍼:

```ts
import type {
  CreateNoticePayload, NoticeCategory, NoticeClubScopeRole, NoticeVisibility,
} from '@duing/types';

export type NoticeFormState = {
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  pinned: boolean;
  expiresAt: string | null;     // YYYY-MM-DDTHH:mm
  notifyOnPublish: boolean;
};

export const EMPTY_NOTICE_FORM: NoticeFormState = {
  title: '',
  summary: '',
  content: '',
  coverImageUrl: '',
  linkUrl: '',
  category: 'GENERAL',
  tags: [],
  visibility: 'PUBLIC',
  clubScopeRole: null,
  targetClubIds: [],
  pinned: false,
  expiresAt: null,
  notifyOnPublish: false,
};

export function toCreatePayload(state: NoticeFormState): CreateNoticePayload {
  return {
    title: state.title.trim(),
    summary: state.summary.trim(),
    content: state.content,
    coverImageUrl: state.coverImageUrl,
    linkUrl: state.linkUrl.trim() === '' ? null : state.linkUrl.trim(),
    category: state.category,
    tags: state.tags,
    visibility: state.visibility,
    clubScopeRole: state.visibility === 'CLUB_SCOPED' ? state.clubScopeRole : null,
    targetClubIds: state.visibility === 'CLUB_SCOPED' ? state.targetClubIds : [],
    pinned: state.pinned,
    expiresAt: state.expiresAt,
    notifyOnPublish: state.visibility === 'PUBLIC' ? state.notifyOnPublish : true,
  };
}
```

- [ ] **Step 3: 타입체크 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_lib/
git commit -m "feat(frontend): admin notice form state 모델 + 라벨 유틸 추가"
```

---

## Task 6 — `NoticeCoverUploader.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_components/NoticeCoverUploader.tsx`

`useFileUploadMutation` + `purpose='NOTICE_COVER'` 사용. 기존 club photo 업로더 패턴 참조 (`apps/web/app/manage/clubs/[clubId]/photos/_components/` 또는 club 정보 폼). 작성 후:

```tsx
'use client';

import { useRef } from 'react';
import { useFileUploadMutation } from '@duing/hooks';

type Props = {
  value: string;
  onChange: (url: string) => void;
};

export function NoticeCoverUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (file: File) => {
    const result = await uploadMutation.mutateAsync({ file, purpose: 'NOTICE_COVER' });
    onChange(result.url);
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-graysoft border border-line">
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
            <img src={value} alt="대표 이미지" className="absolute inset-0 w-full h-full object-cover" />
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px]">
            대표 이미지를 업로드하세요
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleSelect(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
        >{uploadMutation.isPending ? '업로드 중…' : value ? '교체' : '업로드'}</button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-md text-[13px] text-charcoal-2 hover:bg-graysoft"
          >제거</button>
        )}
      </div>
      {uploadMutation.isError && (
        <p className="text-red-500 text-[12px]">업로드 실패. 다시 시도해주세요.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 1: 작성 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_components/NoticeCoverUploader.tsx
git commit -m "feat(frontend): NoticeCoverUploader 컴포넌트 추가"
```

---

## Task 7 — `NoticeMarkdownEditor.tsx` + `NoticeTagInput.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_components/NoticeMarkdownEditor.tsx`
- Create: `frontend/apps/web/app/admin/notices/_components/NoticeTagInput.tsx`

- [ ] **Step 1: `NoticeMarkdownEditor.tsx` — textarea + 라이브 프리뷰 (이미 설치된 react-markdown 재사용)**

```tsx
'use client';

import { NoticeMarkdown } from '../../../notices/_components/NoticeMarkdown';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function NoticeMarkdownEditor({ value, onChange }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        placeholder="마크다운 본문을 입력하세요"
        className="px-3.5 py-2.5 rounded-xl border border-line bg-paper text-[13.5px] leading-relaxed resize-y font-mono"
      />
      <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 overflow-auto">
        {value.trim() ? (
          <NoticeMarkdown content={value} />
        ) : (
          <p className="text-charcoal-3 text-[13px]">미리보기 영역</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `NoticeTagInput.tsx`**

```tsx
'use client';

import { useState } from 'react';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
};

export function NoticeTagInput({ value, onChange, max = 8 }: Props) {
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const tag = draft.trim();
    if (!tag) return;
    if (tag.length > 20) return;
    if (value.includes(tag)) { setDraft(''); return; }
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (target: string) => {
    onChange(value.filter((tag) => tag !== target));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-graysoft text-charcoal-2 text-[12px]">
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-charcoal-3 hover:text-ink"
              aria-label={`${tag} 태그 제거`}
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder={`태그 입력 후 Enter (최대 ${max}개, 20자 이하)`}
          className="flex-1 px-3 py-2 rounded-md border border-line bg-paper text-[13px]"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={value.length >= max}
          className="px-3 py-2 rounded-md bg-paper border border-line text-[13px] font-semibold disabled:opacity-50"
        >추가</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_components/NoticeMarkdownEditor.tsx \
       frontend/apps/web/app/admin/notices/_components/NoticeTagInput.tsx
git commit -m "feat(frontend): 마크다운 라이브 프리뷰 에디터 + 태그 입력 컴포넌트 추가"
```

---

## Task 8 — `VisibilityPicker.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_components/VisibilityPicker.tsx`

CLUB_SCOPED 선택 시 클럽 multi-select + role 라디오. 클럽 목록은 `client.admin.clubs.list` 로 가져옴 (이미 존재). 단순화를 위해 본 PR 에서는 size=200 으로 한 번 조회해서 그대로 select 에 보여준다. 페이지네이션·검색은 후속에서.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useAdminClubListQuery } from '@duing/hooks';
import type { NoticeClubScopeRole, NoticeVisibility } from '@duing/types';
import { VISIBILITY_LABEL, CLUB_SCOPE_ROLE_LABEL } from '../_lib/visibilityLabels';

type Props = {
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  onVisibilityChange: (next: NoticeVisibility) => void;
  onClubScopeRoleChange: (next: NoticeClubScopeRole | null) => void;
  onTargetClubIdsChange: (next: number[]) => void;
};

const VISIBILITY_OPTIONS: NoticeVisibility[] = ['PUBLIC', 'OFFICERS_ALL', 'CLUB_SCOPED'];
const ROLE_OPTIONS: NoticeClubScopeRole[] = ['OFFICERS_ONLY', 'ALL_MEMBERS'];

export function VisibilityPicker({
  visibility, clubScopeRole, targetClubIds,
  onVisibilityChange, onClubScopeRoleChange, onTargetClubIdsChange,
}: Props) {
  const clubsQuery = useAdminClubListQuery(
    { page: 0, size: 200, status: undefined, category: undefined, division: undefined, keyword: undefined },
    visibility === 'CLUB_SCOPED',
  );

  return (
    <div className="space-y-3">
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = opt === visibility;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onVisibilityChange(opt);
                if (opt !== 'CLUB_SCOPED') {
                  onClubScopeRoleChange(null);
                  onTargetClubIdsChange([]);
                } else if (clubScopeRole === null) {
                  onClubScopeRoleChange('OFFICERS_ONLY');
                }
              }}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold ${
                active ? 'bg-ink text-paper' : 'bg-paper border border-line text-charcoal-2'
              }`}
            >{VISIBILITY_LABEL[opt]}</button>
          );
        })}
      </div>

      {visibility === 'CLUB_SCOPED' && (
        <div className="space-y-3 pl-2 border-l-2 border-line">
          <div role="radiogroup" className="flex gap-2">
            {ROLE_OPTIONS.map((role) => {
              const active = role === clubScopeRole;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => onClubScopeRoleChange(role)}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold ${
                    active ? 'bg-ink text-paper' : 'bg-paper border border-line text-charcoal-2'
                  }`}
                >{CLUB_SCOPE_ROLE_LABEL[role]}</button>
              );
            })}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-md border border-line">
            {clubsQuery.isLoading && (
              <p className="px-3 py-4 text-charcoal-3 text-[13px]">동아리 목록 불러오는 중…</p>
            )}
            {clubsQuery.data?.content.map((club) => {
              const checked = targetClubIds.includes(club.id);
              return (
                <label
                  key={club.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-graysoft cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        onTargetClubIdsChange(targetClubIds.filter((id) => id !== club.id));
                      } else {
                        onTargetClubIdsChange([...targetClubIds, club.id]);
                      }
                    }}
                  />
                  <span>{club.name}</span>
                </label>
              );
            })}
          </div>

          <p className="text-[12px] text-charcoal-3">
            선택된 동아리: {targetClubIds.length}개
          </p>
        </div>
      )}
    </div>
  );
}
```

(`useAdminClubListQuery` 가 이미 존재하는지 확인 — 없으면 기존 `useClubListQuery` 의 admin 버전을 사용하거나 client.admin.clubs.list 를 직접 호출하는 새 훅을 추가. Implementer 는 packages/hooks 의 admin.ts 또는 clubs.ts 를 먼저 읽어 적합한 훅을 골라 사용한다.)

- [ ] **Step 2: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_components/VisibilityPicker.tsx
git commit -m "feat(frontend): VisibilityPicker (CLUB_SCOPED 동아리 선택) 추가"
```

---

## Task 9 — `NoticeForm.tsx` (공유 폼)

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx`

작성/수정 페이지 공유. 부모가 `initialState` + `onSubmit(state)` + 제출 라벨 정도만 주입.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_OPTIONS } from '../../../notices/_lib/categoryLabels';
import { NoticeCoverUploader } from './NoticeCoverUploader';
import { NoticeMarkdownEditor } from './NoticeMarkdownEditor';
import { NoticeTagInput } from './NoticeTagInput';
import { VisibilityPicker } from './VisibilityPicker';
import {
  type NoticeFormState,
} from '../_lib/parseNoticeFormState';

type Props = {
  initialState: NoticeFormState;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (state: NoticeFormState) => void;
  errorMessage?: string | null;
};

export function NoticeForm({ initialState, submitLabel, isSubmitting, onSubmit, errorMessage }: Props) {
  const [state, setState] = useState<NoticeFormState>(initialState);

  const update = <K extends keyof NoticeFormState>(key: K, value: NoticeFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(state);
  };

  const notifyToggleEnabled = state.visibility === 'PUBLIC';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="제목 (≤120자)">
        <input
          type="text" maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="요약 (≤300자, 카드 노출용)">
        <textarea
          value={state.summary} maxLength={300} rows={2}
          onChange={(event) => update('summary', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="대표 이미지">
        <NoticeCoverUploader value={state.coverImageUrl} onChange={(url) => update('coverImageUrl', url)} />
      </Field>

      <Field label="본문 (마크다운)">
        <NoticeMarkdownEditor value={state.content} onChange={(next) => update('content', next)} />
      </Field>

      <Field label="외부 링크 (선택)">
        <input
          type="url"
          value={state.linkUrl}
          onChange={(event) => update('linkUrl', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="카테고리">
        <select
          value={state.category}
          onChange={(event) => update('category', event.target.value as NoticeCategory)}
          className="px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
        >
          {NOTICE_CATEGORY_OPTIONS.filter((opt) => opt.value !== 'ALL').map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      <Field label="태그 (최대 8개)">
        <NoticeTagInput value={state.tags} onChange={(next) => update('tags', next)} />
      </Field>

      <Field label="노출 범위">
        <VisibilityPicker
          visibility={state.visibility}
          clubScopeRole={state.clubScopeRole}
          targetClubIds={state.targetClubIds}
          onVisibilityChange={(next) => update('visibility', next)}
          onClubScopeRoleChange={(next) => update('clubScopeRole', next)}
          onTargetClubIdsChange={(next) => update('targetClubIds', next)}
        />
      </Field>

      <Field label="만료일 (선택)">
        <input
          type="date"
          value={state.expiresAt ? state.expiresAt.slice(0, 10) : ''}
          onChange={(event) => update('expiresAt', event.target.value ? `${event.target.value}T23:59` : null)}
          className="px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
        />
      </Field>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.pinned}
            onChange={(event) => update('pinned', event.target.checked)}
          />
          상단 고정
        </label>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={notifyToggleEnabled ? state.notifyOnPublish : true}
            disabled={!notifyToggleEnabled}
            onChange={(event) => update('notifyOnPublish', event.target.checked)}
          />
          알림 발송
          {!notifyToggleEnabled && (
            <span className="text-[11.5px] text-charcoal-3">(공개 범위 외에서는 자동 발송)</span>
          )}
        </label>
      </div>

      {errorMessage && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[13px] text-coral">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || !state.coverImageUrl}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-50"
        >{isSubmitting ? '저장 중…' : submitLabel}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: 타입체크 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_components/NoticeForm.tsx
git commit -m "feat(frontend): NoticeForm 공유 컴포넌트 추가 (admin 작성/수정)"
```

---

## Task 10 — `AdminNoticesFilterBar` + `AdminNoticesTable` + `AdminNoticeDeleteDialog`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_components/AdminNoticesFilterBar.tsx`
- Create: `frontend/apps/web/app/admin/notices/_components/AdminNoticesTable.tsx`
- Create: `frontend/apps/web/app/admin/notices/_components/AdminNoticeDeleteDialog.tsx`

- [ ] **Step 1: FilterBar** (visibility select + keyword + includeExpired toggle)

```tsx
'use client';

import type { NoticeVisibility } from '@duing/types';
import { VISIBILITY_LABEL } from '../_lib/visibilityLabels';

type Props = {
  visibility: NoticeVisibility | 'ALL';
  keyword: string;
  includeExpired: boolean;
  onVisibilityChange: (next: NoticeVisibility | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
  onIncludeExpiredChange: (next: boolean) => void;
};

const OPTIONS: (NoticeVisibility | 'ALL')[] = ['ALL', 'PUBLIC', 'OFFICERS_ALL', 'CLUB_SCOPED'];

export function AdminNoticesFilterBar({
  visibility, keyword, includeExpired,
  onVisibilityChange, onKeywordChange, onKeywordSubmit, onIncludeExpiredChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={visibility}
        onChange={(event) => onVisibilityChange(event.target.value as typeof visibility)}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? '전체 범위' : VISIBILITY_LABEL[opt]}
          </option>
        ))}
      </select>

      <form
        onSubmit={(event) => { event.preventDefault(); onKeywordSubmit(); }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목 검색"
          className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
        />
        <button type="submit" className="px-3 py-1.5 rounded-md bg-ink text-paper text-[13px] font-semibold">검색</button>
      </form>

      <label className="inline-flex items-center gap-1.5 text-[13px] text-charcoal-2">
        <input
          type="checkbox"
          checked={includeExpired}
          onChange={(event) => onIncludeExpiredChange(event.target.checked)}
        />
        만료 포함
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Table**

```tsx
'use client';

import Link from 'next/link';
import type { AdminNoticeSummary } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../../../notices/_lib/categoryLabels';
import { VISIBILITY_LABEL } from '../_lib/visibilityLabels';

type Props = {
  items: AdminNoticeSummary[];
  onDeleteClick: (id: number, title: string) => void;
};

export function AdminNoticesTable({ items, onDeleteClick }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">조건에 맞는 공지가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>제목</Th><Th>카테고리</Th><Th>노출 범위</Th><Th>발행일</Th><Th>만료</Th><Th>알림</Th><Th>고정</Th><Th>액션</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((notice) => (
            <tr key={notice.id} className="border-t border-line">
              <Td>
                <Link href={`/admin/notices/${notice.id}/edit`} className="hover:underline">
                  {notice.title}
                </Link>
              </Td>
              <Td>{NOTICE_CATEGORY_LABEL[notice.category]}</Td>
              <Td>{VISIBILITY_LABEL[notice.visibility]}</Td>
              <Td>{new Date(notice.createdAt).toLocaleDateString('ko-KR')}</Td>
              <Td>{notice.expiresAt ? new Date(notice.expiresAt).toLocaleDateString('ko-KR') : '—'}</Td>
              <Td>{notice.notifyOnPublish ? '발송' : '미발송'}</Td>
              <Td>{notice.pinned ? '📌' : ''}</Td>
              <Td>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/notices/${notice.id}/edit`}
                    className="text-[12px] text-charcoal-2 hover:text-ink"
                  >수정</Link>
                  <button
                    type="button"
                    onClick={() => onDeleteClick(notice.id, notice.title)}
                    className="text-[12px] text-coral hover:underline"
                  >삭제</button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
```

- [ ] **Step 3: DeleteDialog (간단한 confirm)**

```tsx
'use client';

type Props = {
  title: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminNoticeDeleteDialog({ title, isPending, onConfirm, onCancel }: Props) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40">
      <div className="rounded-2xl bg-paper p-6 max-w-sm w-full">
        <h2 className="text-[15px] font-bold text-ink">공지를 삭제할까요?</h2>
        <p className="mt-2 text-[13px] text-charcoal-2">"{title}" 항목이 더 이상 노출되지 않습니다.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-line text-[13px] text-charcoal-2"
          >취소</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md bg-coral text-paper text-[13px] font-semibold disabled:opacity-50"
          >{isPending ? '삭제 중…' : '삭제'}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_components/AdminNoticesFilterBar.tsx \
       frontend/apps/web/app/admin/notices/_components/AdminNoticesTable.tsx \
       frontend/apps/web/app/admin/notices/_components/AdminNoticeDeleteDialog.tsx
git commit -m "feat(frontend): admin notice 목록 필터/테이블/삭제 다이얼로그 추가"
```

---

## Task 11 — `AdminNoticesListPage` + `/admin/notices/page.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_pages/AdminNoticesListPage.tsx`
- Create: `frontend/apps/web/app/admin/notices/page.tsx`

- [ ] **Step 1: 컨테이너 페이지** (state + 쿼리 + 삭제 mutation)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { NoticeVisibility } from '@duing/types';
import {
  useAdminNoticeListQuery,
  useAdminNoticeDeleteMutation,
} from '@duing/hooks';
import { AdminNoticesFilterBar } from '../_components/AdminNoticesFilterBar';
import { AdminNoticesTable } from '../_components/AdminNoticesTable';
import { AdminNoticeDeleteDialog } from '../_components/AdminNoticeDeleteDialog';
import { Pagination } from '../../../notices/_components/Pagination';

const PAGE_SIZE = 20;

export function AdminNoticesListPage() {
  const [visibility, setVisibility] = useState<NoticeVisibility | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const listQuery = useAdminNoticeListQuery({
    visibility: visibility === 'ALL' ? undefined : visibility,
    keyword: keyword || undefined,
    includeExpired,
    page,
    size: PAGE_SIZE,
  });
  const deleteMutation = useAdminNoticeDeleteMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">공지 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">총동연 공지를 작성·수정·삭제합니다.</p>
        </div>
        <Link
          href="/admin/notices/new"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >+ 새 공지</Link>
      </header>

      <div className="mb-5">
        <AdminNoticesFilterBar
          visibility={visibility}
          keyword={keywordInput}
          includeExpired={includeExpired}
          onVisibilityChange={(next) => { setVisibility(next); setPage(0); }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => { setKeyword(keywordInput); setPage(0); }}
          onIncludeExpiredChange={(next) => { setIncludeExpired(next); setPage(0); }}
        />
      </div>

      {listQuery.isLoading && <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>}
      {listQuery.isError && <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>}
      {listQuery.isSuccess && (
        <AdminNoticesTable
          items={items}
          onDeleteClick={(id, title) => setDeleteTarget({ id, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <AdminNoticeDeleteDialog
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

- [ ] **Step 2: `page.tsx` 진입점**

```tsx
import { AdminNoticesListPage } from './_pages/AdminNoticesListPage';

export default function Page() {
  return <AdminNoticesListPage />;
}
```

- [ ] **Step 3: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_pages/AdminNoticesListPage.tsx \
       frontend/apps/web/app/admin/notices/page.tsx
git commit -m "feat(frontend): /admin/notices 관리 목록 페이지 추가"
```

---

## Task 12 — `AdminNoticeNewPage` + `/admin/notices/new/page.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_pages/AdminNoticeNewPage.tsx`
- Create: `frontend/apps/web/app/admin/notices/new/page.tsx`

- [ ] **Step 1: 컨테이너 페이지**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminNoticeCreateMutation } from '@duing/hooks';
import { NoticeForm } from '../_components/NoticeForm';
import { EMPTY_NOTICE_FORM, toCreatePayload } from '../_lib/parseNoticeFormState';

export function AdminNoticeNewPage() {
  const router = useRouter();
  const createMutation = useAdminNoticeCreateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">새 공지 작성</h1>
      </header>
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="발행하기"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          createMutation.mutate(toCreatePayload(state), {
            onSuccess: (id) => router.push(`/admin/notices/${id}/edit`),
            onError: (error) => {
              const message = extractErrorMessage(error);
              setErrorMessage(message ?? '발행에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}

function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return null;
}
```

- [ ] **Step 2: page 진입점**

```tsx
import { AdminNoticeNewPage } from '../_pages/AdminNoticeNewPage';

export default function Page() {
  return <AdminNoticeNewPage />;
}
```

- [ ] **Step 3: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_pages/AdminNoticeNewPage.tsx \
       frontend/apps/web/app/admin/notices/new/page.tsx
git commit -m "feat(frontend): /admin/notices/new 작성 페이지 추가"
```

---

## Task 13 — `AdminNoticeEditPage` + `/admin/notices/[noticeId]/edit/page.tsx`

**Files:**
- Create: `frontend/apps/web/app/admin/notices/_pages/AdminNoticeEditPage.tsx`
- Create: `frontend/apps/web/app/admin/notices/[noticeId]/edit/page.tsx`

- [ ] **Step 1: 컨테이너**

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useAdminNoticeDetailQuery,
  useAdminNoticeUpdateMutation,
} from '@duing/hooks';
import { NoticeForm } from '../_components/NoticeForm';
import {
  EMPTY_NOTICE_FORM,
  toCreatePayload,
  type NoticeFormState,
} from '../_lib/parseNoticeFormState';

export function AdminNoticeEditPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useRouter();
  const detailQuery = useAdminNoticeDetailQuery(noticeId);
  const updateMutation = useAdminNoticeUpdateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }

  const notice = detailQuery.data;
  const initialState: NoticeFormState = {
    ...EMPTY_NOTICE_FORM,
    title: notice.title,
    summary: notice.summary,
    content: notice.content,
    coverImageUrl: notice.coverImageUrl,
    linkUrl: notice.linkUrl ?? '',
    category: notice.category,
    tags: notice.tags,
    visibility: notice.visibility ?? 'PUBLIC',
    clubScopeRole: notice.clubScopeRole,
    targetClubIds: notice.targetClubIds ?? [],
    pinned: notice.pinned,
    expiresAt: notice.expiresAt,
    notifyOnPublish: notice.notifyOnPublish,
  };

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">공지 수정</h1>
      </header>
      <NoticeForm
        initialState={initialState}
        submitLabel="수정 저장"
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          if (noticeId === null) return;
          setErrorMessage(null);
          const payload = toCreatePayload(state);
          updateMutation.mutate({ noticeId, payload }, {
            onSuccess: () => router.push('/admin/notices'),
            onError: (error) => {
              const message = error && typeof error === 'object' && 'message' in error
                ? String((error as { message: unknown }).message)
                : null;
              setErrorMessage(message ?? '수정에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: `page.tsx` 진입점**

```tsx
import { AdminNoticeEditPage } from '../../_pages/AdminNoticeEditPage';

export default function Page() {
  return <AdminNoticeEditPage />;
}
```

- [ ] **Step 3: 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/admin/notices/_pages/AdminNoticeEditPage.tsx \
       frontend/apps/web/app/admin/notices/[noticeId]/edit/page.tsx
git commit -m "feat(frontend): /admin/notices/[id]/edit 수정 페이지 추가"
```

---

## Task 14 — 알림 페이지/벨 BROADCAST source 시각 차별 + source-aware read

**Files:**
- Modify: `frontend/apps/web/app/notifications/page.tsx`
- Modify: `frontend/apps/web/app/notifications/_components/NotificationItem.tsx`
- Modify: `frontend/apps/web/app/_components/NotificationBell.tsx`

- [ ] **Step 1: `NotificationItem.tsx` — 시각 차별 + source-aware onClick**

```tsx
// 상단 import 에서 useNotificationReadMutation → useNotificationSourceAwareReadMutation 으로 교체 (또는 부모에서 source-aware 호출)
// 단순화: NotificationItem 은 그대로 두고 source chip 만 추가, onClick 은 부모가 source 와 id 를 함께 mutation 에 전달.
```

실제 변경:

1. `NotificationItem` 의 props 에 `source: NotificationSource` 와 `onRead?: (id: number, source: NotificationSource) => void` 가 이미 prop 으로 흐르도록 하고, "공지" chip 을 BROADCAST 인 경우 표시.

2. `/notifications/page.tsx` 와 `NotificationBell.tsx` 에서 `useNotificationReadMutation` 호출을 `useNotificationSourceAwareReadMutation` 으로 교체. `mutate` 호출 시 `{ source: notification.source, id: notification.id }` 전달.

```tsx
// 예: page.tsx 내부
const readMutation = useNotificationSourceAwareReadMutation();
// ...
onClick={() => readMutation.mutate({ source: notification.source, id: notification.id })}
```

3. BROADCAST chip — `NotificationItem` 안의 메타 라인에 `source === 'BROADCAST'` 일 때:

```tsx
<span className="px-1.5 py-0.5 rounded-full bg-graysoft text-charcoal-2 text-[10.5px] font-semibold">공지</span>
```

`PERSONAL` 은 chip 없음 (기존 그대로).

- [ ] **Step 2: 정리 — 기존 `useNotificationReadMutation` 호출 제거**

다른 곳에서 `useNotificationReadMutation` 을 더 사용하지 않는다면 export 제거 가능 — 단 BC 유지를 위해 hook 자체는 그대로 둔다 (다른 외부 패키지가 import 할 수 있음).

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/notifications/ frontend/apps/web/app/_components/NotificationBell.tsx
git commit -m "feat(frontend): 알림 페이지/벨에 BROADCAST 시각 차별 + source-aware 읽음 처리"
```

---

## Task 15 — Vitest 테스트

**Files:**
- Create: `frontend/apps/web/test/admin/notices/admin-notices-list.test.tsx`
- Create: `frontend/apps/web/test/admin/notices/notice-form.test.tsx`
- Create: `frontend/apps/web/test/notifications/broadcast-read.test.tsx`

기존 `notices-page.test.tsx` 패턴 (`vi.mock('@duing/hooks')` 모킹) 을 그대로 차용.

- [ ] **Step 1: admin 목록 테스트**

3 시나리오:
1. 응답이 비어 있으면 "조건에 맞는 공지가 없습니다" 메시지가 보인다.
2. visibility 필터를 변경하면 query 인자가 갱신되고 page 가 0 으로 리셋된다.
3. 삭제 버튼 → 다이얼로그 → 확인 → mutation 호출.

- [ ] **Step 2: 폼 테스트**

4 시나리오:
1. `EMPTY_NOTICE_FORM` 초기 상태에서 cover 가 비어 있으면 제출 버튼이 disabled.
2. visibility=CLUB_SCOPED 선택 시 `VisibilityPicker` 의 클럽 multi-select 가 보인다.
3. visibility=PUBLIC 이 아닌 경우 notifyOnPublish 체크박스가 disabled.
4. 태그 8개 입력 후 9번째는 추가되지 않는다.

- [ ] **Step 3: BROADCAST read 테스트**

2 시나리오:
1. source=BROADCAST 알림 클릭 → `client.notifications.markBroadcastRead` 호출 (mock).
2. source=PERSONAL 알림 클릭 → `client.notifications.markRead` 호출.

- [ ] **Step 4: 실행 + 커밋**

```bash
pnpm --filter @duing/web test
git add frontend/apps/web/test/
git commit -m "test(frontend): admin notice 목록/폼 + broadcast 읽음 테스트 추가"
```

---

## Task 16 — 최종 빌드 + PR

- [ ] **Step 1: lint/typecheck/test**

```bash
pnpm --filter @duing/web lint
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web test
```

(주의: `pnpm --filter @duing/web build` 는 P3 머지 이후에도 `/_error` prerender 실패가 잔존. 본 PR 도 같은 이유로 build 가 실패할 수 있으며 본 PR 범위에서는 다루지 않는다 — CI 가 실패하면 별도 hotfix 와 함께 처리. 가능하면 사전에 `frontend/_error` 이슈를 별도 PR 로 분리 권장.)

- [ ] **Step 2: PR 작성** (gh pr create)

본문 템플릿:

```
## 🚀 작업 내용
총동연(ADMIN) 이 공지를 작성·수정·삭제할 수 있는 /admin/notices 관리 화면을 신설한다.
P3 의 공개 피드와 동일한 디자인 시스템 토큰 위에서 목록 테이블, 작성/수정 공유 폼
(NoticeForm), CLUB_SCOPED 클럽 선택 picker, 마크다운 라이브 프리뷰 에디터, 대표
이미지 업로더 등을 갖춘다. 알림 페이지/벨에는 BROADCAST source 시각 차별과
source-aware 읽음 PATCH 와이어링을 마무리한다. 백엔드는 FilePurpose enum 에
NOTICE_COVER 하나만 추가.

## 🤔 고민했던 내용
- 별도 마크다운 에디터 의존성 (@uiw/react-md-editor) 도입 대신 P3 에 이미 들어온
  react-markdown 을 라이브 프리뷰로 재사용해 번들 크기/유지보수 비용을 줄였다.
- 작성/수정 폼을 공유한 단일 NoticeForm 으로 두고 컨테이너에서 mutation 만 갈아끼움.
- visibility=PUBLIC 외 케이스에서 notifyOnPublish 토글은 백엔드 정규화와 정합되게
  체크박스를 disabled 처리.
- 알림 read 호출은 hook 한 곳에 source-aware 분기 mutation 으로 캡슐화해
  컴포넌트의 호출 사이트는 source 와 id 만 넘기면 되도록 함.

## 💬 리뷰 중점사항
- spec: docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md
- plan: docs/superpowers/plans/2026-05-20-pr4-admin-notice-management-frontend.md
- NoticeForm 의 visibility 전환 시 clubScopeRole / targetClubIds / notifyOnPublish 정규화
- /admin/notices 목록의 filter / pagination / 삭제 다이얼로그 invalidate 흐름
- useNotificationSourceAwareReadMutation 의 source 분기 + invalidate
- FilePurpose 백엔드/프론트 enum 동기화

## 📦 Out of Scope
- 수신자 사전 카운트 API/UI
- 무한 스크롤, 페이지네이션 점프
- 댓글/반응
- 카테고리 enum → 테이블화 (D)
- @uiw/react-md-editor 도입
- 통계 / 노출 수
```

- [ ] **Step 3: 머지 전 self-check**

- [ ] Out of Scope 섹션 spec 에 명시되어 있음
- [ ] PR 본문에 spec/plan 링크 포함
- [ ] 모든 mutation 의 invalidate 범위 확인
- [ ] FilePurpose 백엔드/프론트 동기화 확인
- [ ] BROADCAST chip 텍스트가 한국어로 일관 ("공지")
- [ ] `notifyOnPublish` 토글이 PUBLIC 에서만 활성
- [ ] 커밋 메시지 모두 Conventional Commits, Claude attribution 없음

---

## Self-Review

- [x] **Spec coverage**: § 5.4 admin 목록 / § 5.5 작성·수정 폼 / § 5.6 알림 페이지 broadcast UI 모두 task 화.
- [x] **Out of Scope 명시**: 사전 카운트 / 무한 스크롤 / 댓글 / 카테고리 테이블화 / `@uiw/react-md-editor` / 통계 모두 본 PR 제외.
- [x] **Backend 의존성**: P1·P2 머지로 API 모두 사용 가능. Task 1 의 FilePurpose 백엔드 enum 추가는 작은 한 줄 변경이며 본 PR 에 포함.
- [x] **Placeholder scan**: 없음. Task 14 의 NotificationItem props 변경은 기존 사용처를 implementer 가 먼저 grep 으로 확인 후 작업하라고 명시.
- [x] **Type consistency**: `NoticeFormState` 한 곳에서 정의, `toCreatePayload` 한 곳에서 변환, `useAdminNotice*` 훅들이 동일 payload 타입 사용.
- [x] **알림 hook 호환성**: 기존 `useNotificationReadMutation` 은 export 유지, 새 `useNotificationSourceAwareReadMutation` 을 추가하는 확장 — 외부 패키지 호환 OK.
- [ ] **유의**:
  - Task 8 의 `useAdminClubListQuery` 이름은 가정. Implementer 는 `packages/hooks/src/admin.ts` 를 먼저 읽어 실제 admin clubs 쿼리 훅 이름을 확인하고 사용한다. 없으면 `client.admin.clubs.list` 를 useQuery 로 래핑하는 짧은 훅을 추가.
  - Task 11/12/13 의 컨테이너는 `_pages/` 디렉터리 사용 — `/admin/clubs/_pages/AdminClubsListPage.tsx` 의 컨벤션 답습.
  - `frontend/_error` prerender 이슈는 본 PR 도 영향을 받을 수 있음 — Task 16 Step 1 에 명시. CI 가 실패하면 별도 hotfix 와 함께 처리.
