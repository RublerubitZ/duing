# P3 — 프론트엔드 메인 공지 탭 분리 + `/notices` 피드 + `/notices/{id}` 상세 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P1·P2 의 백엔드 Notice / NoticeBroadcast 도메인을 프론트엔드에 노출한다. 메인 페이지의 "공지" 탭이 현재 알림 페이지로 가는 것을 끊고, 이미지 중심 카드 피드(`/notices`) 와 상세 페이지(`/notices/{id}`) 를 신설한다. 알림 아이콘은 그대로 두되 통합 응답(개인 + broadcast) 을 받도록 타입/훅 시그니처만 갱신한다 (UI 자체 추가 변경은 P4 가 담당).

**Architecture:** Next.js 15 App Router. `/notices` 는 Client Component (필터/페이지네이션 state) + TanStack Query 로 백엔드 `GET /api/v1/notices` 호출. 상세는 동적 라우트 Client Component + `GET /api/v1/notices/{id}`. 마크다운은 read-only `react-markdown` 으로 렌더. Pagination 은 spec 정합을 위해 offset 기반(`Pagination` 컴포넌트 — prev/next + 페이지 번호).

**Tech Stack:** Next.js 15 / React 19 / TanStack Query v5 / Zustand / Tailwind / pnpm workspaces / Vitest

**Spec reference:** `docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md` (§ 5.1 라우팅 · § 5.2 피드 · § 5.3 상세 · § 5.6 알림 페이지 broadcast 통합 — UI 변경은 P4)

**Backend ready:**
- P1 (#121, merged): `GET /api/v1/notices`, `GET /api/v1/notices/{noticeId}` 가시성 필터 포함
- P2 (#122, merged): `GET /api/v1/me/notifications` union 응답에 `source: PERSONAL|BROADCAST` 디스크리미네이터 추가

**Branch:** `feat/notice-feed-frontend`

**Out of Scope (이 PR 아님)**
- `/admin/notices` 관리 화면 (P4)
- 알림 페이지/벨 UI 의 broadcast 시각 차별화 (P4) — 타입/훅만 갱신해서 컴파일은 유지하되, 새 source 필드를 활용한 UI 변경은 다음 PR
- 카테고리 enum → 테이블화 (D 작업, 보류)
- broadcast 읽음 호출 (`PATCH /me/notifications/broadcasts/{id}/read`) UI 와이어링 (P4)
- 무한 스크롤 (offset 페이지네이션 유지)
- 공지 이미지 업로드 / 작성 폼 (P4)

---

## File Structure

```
frontend/packages/types/src/
  notice.ts                                    [신규] Notice 도메인 타입
  notification.ts                              [수정] source / isRead 추가, NOTICE_TARGETED 추가
  index.ts                                     [수정] notice 재노출

frontend/packages/api/src/
  client.ts                                    [수정] notices.list / notices.detail 메서드 + 응답 page shape

frontend/packages/hooks/src/
  notices.ts                                   [신규] useNoticeListQuery / useNoticeDetailQuery
  noticeQueryKeys.ts                           [신규]
  index.ts                                     [수정] notices 재노출

frontend/apps/web/app/_components/
  ExploreNav.tsx                               [수정] 공지 탭 href 를 `/notices` 로 변경

frontend/apps/web/app/notices/
  page.tsx                                     [신규] 피드 (Client)
  [noticeId]/page.tsx                          [신규] 상세 (Client)
  _components/
    NoticeCard.tsx                             [신규] 카드 아이템
    NoticeFilterBar.tsx                        [신규] 카테고리/검색/태그 필터
    NoticeEmptyState.tsx                       [신규]
    Pagination.tsx                             [신규] prev/next + 페이지 번호
    NoticeDetailHeader.tsx                     [신규] 상세 헤더 (뒤로가기 + 카테고리 칩)
    NoticeMarkdown.tsx                         [신규] react-markdown wrapper (read-only)
    ExpiredBanner.tsx                          [신규] 만료된 공지 표시 배너
  _lib/
    categoryLabels.ts                          [신규] 한국어 라벨 매핑

frontend/apps/web/test/notices/
  page.spec.tsx                                [신규] 피드 페이지 테스트
  detail.spec.tsx                              [신규] 상세 페이지 테스트

frontend/apps/web/package.json                 [수정] react-markdown 의존성 추가
```

---

## Task 1 — Notice 도메인 타입 + Notification 타입 갱신

**Files:**
- Create: `frontend/packages/types/src/notice.ts`
- Modify: `frontend/packages/types/src/notification.ts`
- Modify: `frontend/packages/types/src/index.ts`

- [ ] **Step 1: 신규 `notice.ts`**

```ts
export type NoticeCategory = 'FESTIVAL' | 'FAIR' | 'FUNDING' | 'CONTEST' | 'GENERAL';

export type NoticeVisibility = 'PUBLIC' | 'OFFICERS_ALL' | 'CLUB_SCOPED';

export type NoticeClubScopeRole = 'OFFICERS_ONLY' | 'ALL_MEMBERS';

export type NoticeCardItem = {
  id: number;
  title: string;
  summary: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export type NoticeDetail = {
  id: number;
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  // 아래 4개는 ADMIN 응답에서만 채워진다
  visibility: NoticeVisibility | null;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[] | null;
  notifyOnPublish: boolean;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: `notification.ts` 갱신 — source 디스크리미네이터 + isRead + NOTICE_TARGETED**

기존 파일을 읽고 다음과 같이 교체:

```ts
export type NotificationType =
  | 'RECRUITMENT_OPENED'
  | 'RECRUITMENT_DEADLINE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_REMINDER'
  | 'NOTICE_TARGETED';

export type NotificationSource = 'PERSONAL' | 'BROADCAST';

export type Notification = {
  source: NotificationSource;
  id: number;
  type: NotificationType | null; // BROADCAST 는 null
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;         // BROADCAST 는 null
  createdAt: string;
};
```

- [ ] **Step 3: `index.ts` 에 notice 재노출 추가**

기존 export 목록에 `export * from './notice';` 추가 (알파벳/도메인 순서를 따른다).

- [ ] **Step 4: 타입체크 + 커밋**

```bash
pnpm --filter @duing/types build
git add frontend/packages/types/src/
git commit -m "feat(frontend): notice 도메인 타입 추가 + notification 응답에 source/isRead 반영"
```

(no Claude attribution)

---

## Task 2 — API 클라이언트에 notices 메서드 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 기존 파일 읽기 + Notice 인터페이스 정의**

상단 import 에 `NoticeCardItem`, `NoticeDetail`, `NoticeCategory` 추가 (`@duing/types`). 기존 `notifications` 키 위에 `notices` 인터페이스 블록 추가:

```ts
notices: {
  list(params: {
    category?: NoticeCategory;
    tags?: string[];
    keyword?: string;
    page: number;
    size: number;
  }): Promise<{
    items: NoticeCardItem[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    hasNext: boolean;
  }>;
  detail(noticeId: number): Promise<NoticeDetail>;
};
```

`PageResponse` 의 정확한 응답 모양은 기존 `notifications.list` 의 반환 타입을 참조해서 동일하게 맞춘다 (페이지 메타 키 이름은 백엔드 `PageResponse.from` 산출과 일치해야 한다 — 기존 `notifications` 가 어떻게 매핑되어 있는지 보고 그대로 따라간다).

- [ ] **Step 2: 구현 추가 (`createClient` 내 `notifications` 위에 `notices` 블록)**

```ts
notices: {
  list: ({ category, tags, keyword, page, size }) => {
    const searchParams: Record<string, string | number> = { page, size };
    if (category) searchParams.category = category;
    if (keyword) searchParams.keyword = keyword;
    // tags 는 다중 값 — searchParams 가 string|number 만 받으면 별도 builder 사용
    const url = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => url.append(key, String(value)));
    (tags ?? []).forEach((tag) => url.append('tags', tag));
    return jsonOk<{
      items: NoticeCardItem[];
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
      hasNext: boolean;
    }>(http.get(`notices?${url.toString()}`));
  },
  detail: (noticeId) =>
    jsonOk<NoticeDetail>(http.get(`notices/${noticeId}`)),
},
```

(`jsonOk` 헬퍼 사용 — 기존 `notifications` 호출 패턴 참조. 응답 envelope 가 `{ ok, data }` 형태로 `data` 만 꺼내야 한다면 해당 헬퍼가 이미 처리.)

또한 `notifications.list` 의 응답 타입에 `Notification` 의 새 필드(source/isRead) 가 자동 전파되므로 별도 변경 불필요.

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/api build
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): api 클라이언트에 notices 엔드포인트 추가"
```

---

## Task 3 — React Query 훅 (`useNoticeListQuery`, `useNoticeDetailQuery`)

**Files:**
- Create: `frontend/packages/hooks/src/noticeQueryKeys.ts`
- Create: `frontend/packages/hooks/src/notices.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: `noticeQueryKeys.ts`**

```ts
import type { NoticeCategory } from '@duing/types';

type ListFilters = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

export const noticeQueryKeys = {
  all: ['notices'] as const,
  list: (filters: ListFilters) => ['notices', 'list', filters] as const,
  detail: (noticeId: number) => ['notices', 'detail', noticeId] as const,
};
```

- [ ] **Step 2: `notices.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { NoticeCategory } from '@duing/types';
import { useApiClient } from './api-context';
import { noticeQueryKeys } from './noticeQueryKeys';

type ListParams = {
  category?: NoticeCategory;
  tags?: string[];
  keyword?: string;
  page: number;
  size: number;
};

export function useNoticeListQuery(params: ListParams, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.list(params),
    queryFn: () => client.notices.list(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useNoticeDetailQuery(noticeId: number | null, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: noticeQueryKeys.detail(noticeId ?? -1),
    queryFn: () => client.notices.detail(noticeId as number),
    enabled: enabled && noticeId !== null,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: `index.ts` 재노출**

기존 `notifications` re-export 라인을 참조해 동일한 패턴으로 추가:

```ts
export * from './notices';
export * from './noticeQueryKeys';
```

- [ ] **Step 4: 빌드 + 커밋**

```bash
pnpm --filter @duing/hooks build
git add frontend/packages/hooks/src/
git commit -m "feat(frontend): notice 조회 React Query 훅 추가"
```

---

## Task 4 — ExploreNav: 공지 탭 라우팅 변경

**Files:**
- Modify: `frontend/apps/web/app/_components/ExploreNav.tsx`

- [ ] **Step 1: NAV_ITEMS 수정**

```ts
const NAV_ITEMS = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '캘린더', href: '/calendar' },
  { label: '공지', href: '/notices' },   // /notifications → /notices
] as const;
```

알림 아이콘 (`<button aria-label="알림">`) 은 그대로 유지 — 라우팅 와이어링은 P4 (또는 별도 후속) 에서. 본 task 에서는 nav 탭만 분리.

- [ ] **Step 2: 빌드 검증**

```bash
pnpm --filter @duing/web build
```

(전체 빌드는 무겁다면 `pnpm --filter @duing/web typecheck` 로 대체.)

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/_components/ExploreNav.tsx
git commit -m "feat(frontend): ExploreNav 의 공지 탭 라우팅을 /notices 로 변경"
```

---

## Task 5 — `react-markdown` 의존성 추가

**Files:**
- Modify: `frontend/apps/web/package.json`
- Modify: `frontend/pnpm-lock.yaml` (자동 갱신)

- [ ] **Step 1: 의존성 설치**

```bash
pnpm --filter @duing/web add react-markdown remark-gfm
```

- [ ] **Step 2: 설치 확인**

```bash
pnpm --filter @duing/web list react-markdown remark-gfm
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/package.json frontend/pnpm-lock.yaml
git commit -m "chore(frontend): react-markdown + remark-gfm 의존성 추가"
```

---

## Task 6 — `categoryLabels.ts` + `NoticeCard.tsx`

**Files:**
- Create: `frontend/apps/web/app/notices/_lib/categoryLabels.ts`
- Create: `frontend/apps/web/app/notices/_components/NoticeCard.tsx`

- [ ] **Step 1: `categoryLabels.ts`**

```ts
import type { NoticeCategory } from '@duing/types';

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  FESTIVAL: '축제',
  FAIR: '박람회',
  FUNDING: '지원사업',
  CONTEST: '공모전',
  GENERAL: '일반',
};

export const NOTICE_CATEGORY_OPTIONS: { value: NoticeCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'FESTIVAL', label: '축제' },
  { value: 'FAIR', label: '박람회' },
  { value: 'FUNDING', label: '지원사업' },
  { value: 'CONTEST', label: '공모전' },
  { value: 'GENERAL', label: '일반' },
];
```

- [ ] **Step 2: `NoticeCard.tsx`**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { NoticeCardItem } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';

type Props = {
  notice: NoticeCardItem;
};

export function NoticeCard({ notice }: Props) {
  const dateText = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <Link
      href={`/notices/${notice.id}`}
      className="group block rounded-2xl overflow-hidden bg-paper border border-line hover:border-ink transition-colors"
    >
      <div className="relative aspect-[16/9] bg-graysoft">
        <Image
          src={notice.coverImageUrl}
          alt={notice.title}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
        {notice.pinned && (
          <span
            aria-label="고정"
            className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-paper/90 text-[13px]"
          >📌</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded-full bg-graysoft text-charcoal-2 text-[11px] font-semibold">
            {NOTICE_CATEGORY_LABEL[notice.category]}
          </span>
          {notice.linkUrl && (
            <span aria-label="외부 링크" className="text-charcoal-3 text-xs">↗</span>
          )}
        </div>
        <h3 className="text-[15px] font-bold text-ink leading-snug line-clamp-2">{notice.title}</h3>
        <p className="mt-1 text-[13px] text-charcoal-2 leading-relaxed line-clamp-2">{notice.summary}</p>
        <p className="mt-3 text-[11.5px] text-charcoal-3">{dateText}</p>
      </div>
    </Link>
  );
}
```

(Tailwind 토큰 — `ink`, `paper`, `charcoal-2`, `graysoft`, `line` 은 프로젝트 디자인 시스템 토큰. 기존 컴포넌트의 클래스 사용 패턴을 그대로 따른다.)

- [ ] **Step 3: 컴파일 검증**

```bash
pnpm --filter @duing/web typecheck
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/notices/_lib/ frontend/apps/web/app/notices/_components/NoticeCard.tsx
git commit -m "feat(frontend): NoticeCard 컴포넌트 + 카테고리 라벨 매핑 추가"
```

---

## Task 7 — `NoticeFilterBar`, `Pagination`, `NoticeEmptyState`

**Files:**
- Create: `frontend/apps/web/app/notices/_components/NoticeFilterBar.tsx`
- Create: `frontend/apps/web/app/notices/_components/Pagination.tsx`
- Create: `frontend/apps/web/app/notices/_components/NoticeEmptyState.tsx`

- [ ] **Step 1: `NoticeFilterBar.tsx`**

```tsx
'use client';

import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_OPTIONS } from '../_lib/categoryLabels';

type Props = {
  selectedCategory: NoticeCategory | 'ALL';
  keyword: string;
  onCategoryChange: (next: NoticeCategory | 'ALL') => void;
  onKeywordChange: (next: string) => void;
  onKeywordSubmit: () => void;
};

export function NoticeFilterBar({
  selectedCategory, keyword,
  onCategoryChange, onKeywordChange, onKeywordSubmit,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {NOTICE_CATEGORY_OPTIONS.map((option) => {
          const active = option.value === selectedCategory;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onCategoryChange(option.value)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-ink text-paper'
                  : 'bg-paper border border-line text-charcoal-2 hover:border-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onKeywordSubmit();
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목/요약 검색"
          className="flex-1 px-3.5 py-2 rounded-full bg-paper border border-line text-[13.5px]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >
          검색
        </button>
      </form>
    </div>
  );
}
```

(태그 칩 필터는 본 PR 범위에서는 생략 — 백엔드는 지원하지만 UI 진입점은 후속에서 추가. spec § 5.2 의 "태그 칩 필터" 는 P4 admin form 에서 입력하는 태그가 쌓인 후가 더 합리.)

- [ ] **Step 2: `Pagination.tsx`**

```tsx
'use client';

type Props = {
  page: number;            // 0-based
  totalPages: number;
  onChange: (next: number) => void;
};

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  const start = Math.max(0, Math.min(page - 2, totalPages - windowSize));
  const end = Math.min(totalPages, start + windowSize);
  const visible: number[] = [];
  for (let i = start; i < end; i++) visible.push(i);

  return (
    <nav aria-label="공지 페이지" className="flex items-center justify-center gap-1.5 mt-8">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-charcoal-2 disabled:text-charcoal-3 disabled:cursor-not-allowed hover:bg-graysoft"
      >이전</button>
      {visible.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`min-w-[34px] px-2 py-1.5 rounded-md text-[13px] font-semibold ${
            p === page ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-graysoft'
          }`}
        >{p + 1}</button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-charcoal-2 disabled:text-charcoal-3 disabled:cursor-not-allowed hover:bg-graysoft"
      >다음</button>
    </nav>
  );
}
```

- [ ] **Step 3: `NoticeEmptyState.tsx`**

```tsx
type Props = {
  hasFilter: boolean;
};

export function NoticeEmptyState({ hasFilter }: Props) {
  return (
    <div className="py-24 text-center text-charcoal-3">
      <p className="text-[14px] font-semibold text-charcoal-2">
        {hasFilter ? '검색 결과가 없습니다' : '아직 공지가 없습니다'}
      </p>
      <p className="mt-1.5 text-[13px]">
        {hasFilter ? '카테고리나 검색어를 바꿔보세요.' : '새 공지가 올라오면 여기에 표시됩니다.'}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/notices/_components/
git commit -m "feat(frontend): 공지 필터바 + 페이지네이션 + 빈 상태 컴포넌트 추가"
```

---

## Task 8 — `/notices/page.tsx` (피드 페이지)

**Files:**
- Create: `frontend/apps/web/app/notices/page.tsx`

- [ ] **Step 1: 페이지 컴포넌트**

```tsx
'use client';

import { useState } from 'react';
import type { NoticeCategory } from '@duing/types';
import { useNoticeListQuery } from '@duing/hooks';
import { ExploreNav } from '../_components/ExploreNav';
import { NoticeCard } from './_components/NoticeCard';
import { NoticeFilterBar } from './_components/NoticeFilterBar';
import { NoticeEmptyState } from './_components/NoticeEmptyState';
import { Pagination } from './_components/Pagination';

const PAGE_SIZE = 12;

export default function NoticesPage() {
  const [category, setCategory] = useState<NoticeCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  const listQuery = useNoticeListQuery({
    category: category === 'ALL' ? undefined : category,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.items ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;
  const hasFilter = category !== 'ALL' || keyword.length > 0;

  return (
    <>
      <ExploreNav active="공지" />
      <main className="max-w-layout mx-auto px-10 py-10">
        <header className="mb-8">
          <h1 className="text-[22px] font-bold text-ink">공지</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            축제·박람회·지원사업·공모전 등 총동연 공지를 모아봅니다.
          </p>
        </header>

        <NoticeFilterBar
          selectedCategory={category}
          keyword={keywordInput}
          onCategoryChange={(next) => { setCategory(next); setPage(0); }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => { setKeyword(keywordInput); setPage(0); }}
        />

        <section className="mt-8">
          {listQuery.isLoading && (
            <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
          )}
          {listQuery.isError && (
            <p className="py-12 text-center text-red-500 text-[13px]">공지를 불러오지 못했습니다.</p>
          )}
          {listQuery.isSuccess && items.length === 0 && (
            <NoticeEmptyState hasFilter={hasFilter} />
          )}
          {listQuery.isSuccess && items.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((notice) => (
                <li key={notice.id}>
                  <NoticeCard notice={notice} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Image 도메인 화이트리스트 확인**

`next.config.js` (또는 `next.config.mjs`) 의 `images.remotePatterns` 에 Supabase Storage 호스트가 포함돼 있어야 `coverImageUrl` 이 `<Image>` 로 렌더링된다. 없으면 추가. (기존 `Club` 등에서 동일 패턴이 동작 중이면 그대로 사용 가능 — 변경 불필요.)

- [ ] **Step 3: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/notices/page.tsx
git commit -m "feat(frontend): /notices 피드 페이지 추가"
```

---

## Task 9 — `NoticeMarkdown`, `ExpiredBanner`, `NoticeDetailHeader`

**Files:**
- Create: `frontend/apps/web/app/notices/_components/NoticeMarkdown.tsx`
- Create: `frontend/apps/web/app/notices/_components/ExpiredBanner.tsx`
- Create: `frontend/apps/web/app/notices/_components/NoticeDetailHeader.tsx`

- [ ] **Step 1: `NoticeMarkdown.tsx`**

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
};

export function NoticeMarkdown({ content }: Props) {
  return (
    <div className="prose prose-sm max-w-none text-charcoal-1 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 외부 링크는 새 탭으로
          a: ({ node, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer" className="text-ink underline" />
          ),
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
```

(`prose` 클래스는 Tailwind typography 플러그인 필요 — 프로젝트에 이미 있는지 확인. 없으면 plain 클래스 조합으로 대체.)

- [ ] **Step 2: `ExpiredBanner.tsx`**

```tsx
export function ExpiredBanner({ expiresAt }: { expiresAt: string }) {
  const dateText = new Date(expiresAt).toLocaleDateString('ko-KR');
  return (
    <div
      role="status"
      className="rounded-xl bg-graysoft border border-line px-4 py-3 text-[13px] text-charcoal-2"
    >
      마감된 공지입니다. ({dateText} 종료)
    </div>
  );
}
```

- [ ] **Step 3: `NoticeDetailHeader.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import type { NoticeCategory } from '@duing/types';

type Props = {
  category: NoticeCategory;
};

export function NoticeDetailHeader({ category }: Props) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between mb-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-[13px] text-charcoal-2 hover:text-ink"
        aria-label="뒤로가기"
      >← 뒤로</button>
      <span className="px-2.5 py-1 rounded-full bg-graysoft text-charcoal-2 text-[11.5px] font-semibold">
        {NOTICE_CATEGORY_LABEL[category]}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/notices/_components/NoticeMarkdown.tsx \
       frontend/apps/web/app/notices/_components/ExpiredBanner.tsx \
       frontend/apps/web/app/notices/_components/NoticeDetailHeader.tsx
git commit -m "feat(frontend): 공지 상세용 마크다운/만료배너/헤더 컴포넌트 추가"
```

---

## Task 10 — `/notices/[noticeId]/page.tsx` (상세 페이지)

**Files:**
- Create: `frontend/apps/web/app/notices/[noticeId]/page.tsx`

- [ ] **Step 1: 페이지 컴포넌트**

```tsx
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useNoticeDetailQuery } from '@duing/hooks';
import { ExploreNav } from '../../_components/ExploreNav';
import { NoticeDetailHeader } from '../_components/NoticeDetailHeader';
import { NoticeMarkdown } from '../_components/NoticeMarkdown';
import { ExpiredBanner } from '../_components/ExpiredBanner';

export default function NoticeDetailPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useRouter();

  const detailQuery = useNoticeDetailQuery(noticeId);

  // 권한 없음(403) → 피드로 되돌림
  useEffect(() => {
    const status = (detailQuery.error as { status?: number } | null)?.status;
    if (status === 403) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  if (detailQuery.isLoading) {
    return (
      <>
        <ExploreNav active="공지" />
        <main className="max-w-[760px] mx-auto px-6 py-10">
          <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
        </main>
      </>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <>
        <ExploreNav active="공지" />
        <main className="max-w-[760px] mx-auto px-6 py-10">
          <p className="text-red-500 text-[13px]">공지를 불러오지 못했습니다.</p>
        </main>
      </>
    );
  }

  const notice = detailQuery.data;
  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();
  const publishedDate = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      <ExploreNav active="공지" />
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <NoticeDetailHeader category={notice.category} />
        {expiredAndPast && (
          <div className="mb-6">
            <ExpiredBanner expiresAt={notice.expiresAt as string} />
          </div>
        )}
        <article>
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-graysoft mb-6">
            <Image
              src={notice.coverImageUrl}
              alt={notice.title}
              fill
              sizes="(min-width: 768px) 720px, 100vw"
              className="object-cover"
              priority
            />
          </div>
          <h1 className="text-[22px] font-bold text-ink leading-snug">{notice.title}</h1>
          <p className="mt-2 text-[12.5px] text-charcoal-3">{publishedDate}</p>
          {notice.summary && (
            <p className="mt-4 text-[14px] text-charcoal-2 leading-relaxed">{notice.summary}</p>
          )}
          <div className="mt-6">
            <NoticeMarkdown content={notice.content} />
          </div>
          {notice.linkUrl && (
            <a
              href={notice.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
            >
              자세히 보기 →
            </a>
          )}
        </article>
      </main>
    </>
  );
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/notices/[noticeId]/page.tsx
git commit -m "feat(frontend): /notices/[noticeId] 상세 페이지 추가"
```

---

## Task 11 — Vitest 테스트 (피드 + 상세)

**Files:**
- Create: `frontend/apps/web/test/notices/page.spec.tsx`
- Create: `frontend/apps/web/test/notices/detail.spec.tsx`

기존 테스트 패턴 — `frontend/apps/web/test/clubs/` 또는 `frontend/apps/web/test/manage/` 의 vitest 셋업, 모킹 방식 (API client mock 등) 을 따라간다. Implementer 는 먼저 해당 디렉터리의 기존 테스트 1~2개를 읽어 패턴을 파악한 뒤 작성한다.

- [ ] **Step 1: 피드 테스트** — `page.spec.tsx`

테스트할 시나리오:
1. `useNoticeListQuery` 가 빈 결과를 돌려주면 `NoticeEmptyState` 가 렌더된다 (with `hasFilter=false`)
2. 결과가 있으면 `NoticeCard` 가 N개 렌더된다
3. 카테고리 칩을 클릭하면 query 인자가 갱신된다 (queryKey 또는 mock 호출 인자로 검증)
4. 페이지네이션 다음 클릭 시 page 가 1 증가한다

검증 방식은 기존 frontend 테스트의 모킹 패턴(API context provider 를 fake client 로 감싸기) 을 따른다. 만약 기존 패턴이 `vi.mock('@duing/hooks', ...)` 방식이면 동일하게.

- [ ] **Step 2: 상세 테스트** — `detail.spec.tsx`

시나리오:
1. 상세 응답이 도착하면 제목/카테고리/본문이 렌더된다
2. `linkUrl` 이 있으면 "자세히 보기" CTA 가 보인다
3. `expiresAt` 이 과거이면 `ExpiredBanner` 가 보인다
4. 403 응답이면 `router.replace('/notices')` 가 호출된다 (next/navigation mock)

- [ ] **Step 3: 실행 + 커밋**

```bash
pnpm --filter @duing/web test -- notices
git add frontend/apps/web/test/notices/
git commit -m "test(frontend): /notices 피드·상세 페이지 테스트 추가"
```

---

## Task 12 — 최종 빌드 + PR

- [ ] **Step 1: 전체 lint/typecheck/build/test**

```bash
pnpm --filter @duing/web lint
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web test
pnpm --filter @duing/web build
```

- [ ] **Step 2: PR 작성**

```
gh pr create --base develop --title "feat(frontend): 메인 공지 탭 분리 + /notices 피드/상세 (P3)" --body "..."
```

본문 템플릿:

```
## 🚀 작업 내용
P1·P2 의 백엔드 Notice / NoticeBroadcast 도메인을 프론트엔드에 노출한다.
메인의 "공지" 탭 라우팅을 /notifications → /notices 로 끊고, 이미지 중심
카드 피드 (/notices) 와 마크다운 상세 (/notices/[id]) 를 신설한다.
알림 페이지 UI 자체는 본 PR 에서 손대지 않지만, 통합 응답(개인 + broadcast)
타입/훅 시그니처는 컴파일 정합을 위해 함께 갱신했다.

## 🤔 고민했던 내용
- 페이지네이션을 무한 스크롤이 아닌 offset 기반 prev/next + 페이지 번호로 둠
  (spec § 5.2 정합 + 백엔드 응답의 totalElements 활용).
- 카드 컴포넌트의 cover 이미지를 next/image 로 렌더 — Supabase Storage 호스트가
  next.config 의 remotePatterns 에 이미 등록돼 있다는 전제.
- 마크다운 렌더는 작성용 에디터와 분리해 react-markdown + remark-gfm 으로 간결하게.
- 태그 칩 필터는 본 PR 에서 보류 — 실제 태그가 쌓인 뒤(P4 admin form 가동 후) 추가.

## 💬 리뷰 중점사항
- spec: docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md
- plan: docs/superpowers/plans/2026-05-20-pr3-notice-feed-frontend.md
- `useNoticeListQuery` 의 queryKey shape (page/category/keyword 변경 시 정상 invalidate)
- 상세 페이지의 403 → /notices redirect 동작
- 알림 응답 타입에 source/isRead 가 추가되며 기존 호출자 (NotificationBell, /notifications 페이지) 가 깨지지 않는지

## 📦 Out of Scope
- /admin/notices 관리 화면 (P4)
- 알림 페이지/벨에 BROADCAST source 시각 차별 (P4)
- broadcast 읽음 PATCH 호출 UI (P4)
- 무한 스크롤
- 공지 작성 폼 / 이미지 업로드 (P4)
- 카테고리 enum → 테이블화 (D, 보류)
```

---

## Self-Review

- [x] **Spec coverage**: § 5.1 라우팅 / § 5.2 피드 / § 5.3 상세 / § 5.6 알림 페이지(타입만, UI 는 OOS) 모두 task 화.
- [x] **Out of Scope 명시**: 관리 화면 / broadcast UI / 무한 스크롤 / 태그 칩 / 작성 폼 모두 본 PR 제외로 명시.
- [x] **Placeholder scan**: 없음. Task 11 의 fixture/mock 패턴만 implementer 에게 기존 테스트 파일을 먼저 읽어 모방하라고 명시.
- [x] **Type consistency**: `NoticeCardItem` / `NoticeDetail` / `NoticeCategory` 등 모든 타입이 packages/types/src/notice.ts 한 곳에서 정의되고 api/client.ts, hooks/notices.ts, 페이지 컴포넌트에서 일관 import.
- [x] **App Router 컨벤션**: page.tsx 만 Client (`'use client'`), 컴포넌트는 _components/, 라이브러리는 _lib/ 위치.
- [ ] **유의**:
  - Task 2 의 `client.ts` 페이지 응답 모양(`{ items, page, size, totalElements, totalPages, hasNext }`) 은 백엔드 `PageResponse.from` 산출과 정확히 일치해야 한다. 기존 `notifications.list` 호출이 이미 동일 envelope 를 사용 중이면 패턴 복붙으로 안전. 다르면 implementer 가 `frontend/packages/api/src/client.ts` 의 기존 PageResponse 핸들링을 읽어 맞춘다.
  - Task 5 의 `prose` 클래스는 `@tailwindcss/typography` 플러그인이 등록돼 있어야 동작. 없으면 NoticeMarkdown 의 wrapper className 만 일반 텍스트 스타일로 대체.
  - Task 11 에서 백엔드 API mock 방식은 기존 `test/clubs/*.spec.tsx` 의 패턴을 따라 implementer 가 자체 판단해 작성.
