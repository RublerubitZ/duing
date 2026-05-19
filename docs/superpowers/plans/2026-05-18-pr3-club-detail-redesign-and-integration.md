# PR3 — 학생측 동아리 상세 페이지 디자인 포팅 + 모집 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `handoff/reference_jsx/a-detail.jsx` (`ADetail`) 디자인을 `apps/web/app/clubs/[clubId]/page.tsx` 에 TypeScript + Tailwind 로 포팅한다. 동시에 우측 sticky 카드에서 바로 지원하기 버튼을 누르도록 모집 흐름을 통합하고, 별도 모집 상세 라우트를 제거한다.

**Architecture:** (1) `_components/` 아래에 hero/about/photos/recruitment/contact 컴포넌트 5개 분리, (2) `page.tsx` 는 데이터 페칭 + 조립만 담당, (3) API 가 제공하지 않는 필드는 조건부 렌더링(데이터 없으면 행/섹션 자체 숨김), (4) `/clubs/[clubId]/recruitments/[recruitmentId]` 라우트 삭제 및 잔존 링크는 `/clubs/${clubId}` 로 교체.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, TanStack Query, Tailwind (handoff 토큰 이미 정의됨).

**Spec:** `docs/superpowers/specs/2026-05-18-recruitment-integration-and-always-open-design.md` §2, §4.

**Prerequisite:** PR1, PR2 머지 완료. 타입에 `displayStatus`, `endDate: string | null` 이 적용되어 있어야 함.

**브랜치:** `feat/club-detail-redesign-and-recruitment-integration`

---

## File Structure

**Create:**
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailPhotos.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_lib/clubCategoryLabel.ts`
- `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx`
- `frontend/apps/web/test/clubs/club-category-label.test.ts`

**Modify:**
- `frontend/apps/web/app/clubs/[clubId]/page.tsx` (전체 재작성)
- `frontend/apps/web/app/apply/[recruitmentId]/page.tsx:37` (취소 시 돌아가는 경로 교체)
- `frontend/apps/web/app/calendar/page.tsx:37` (모집 링크 교체)

**Delete:**
- `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`
- (디렉터리가 비면) `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/` 와 그 상위 `recruitments/`

---

## Task 1: 카테고리 라벨 헬퍼

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_lib/clubCategoryLabel.ts`
- Create: `frontend/apps/web/test/clubs/club-category-label.test.ts`

- [ ] **Step 1: 테스트 작성**

`frontend/apps/web/test/clubs/club-category-label.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clubCategoryLabel } from '@/clubs/[clubId]/_lib/clubCategoryLabel';

describe('clubCategoryLabel', () => {
  it.each([
    ['ACADEMIC', '학술'],
    ['CULTURE', '문화'],
    ['ART', '예술'],
    ['SPORTS', '체육'],
    ['VOLUNTEER', '봉사'],
    ['RELIGION', '종교'],
    ['HOBBY', '취미'],
    ['OTHER', '기타'],
  ] as const)('%s → %s', (category, expected) => {
    expect(clubCategoryLabel(category)).toBe(expected);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test -- --run club-category-label`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: 구현**

`frontend/apps/web/app/clubs/[clubId]/_lib/clubCategoryLabel.ts`:

```ts
import type { ClubCategory } from '@duing/types';

const LABELS: Record<ClubCategory, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

export function clubCategoryLabel(category: ClubCategory): string {
  return LABELS[category];
}
```

- [ ] **Step 4: 테스트 통과**

Run: `pnpm --filter web test -- --run club-category-label`
Expected: 8건 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_lib/clubCategoryLabel.ts \
        frontend/apps/web/test/clubs/club-category-label.test.ts
git commit -m "feat(frontend): 동아리 카테고리 한국어 라벨 헬퍼 추가"
```

---

## Task 2: `ClubDetailHero` — 좌측 identity 영역

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx`:

```tsx
'use client';

import type { ClubDetail, RecruitmentDisplayStatus } from '@duing/types';
import { displayStatusLabel } from '../../../_lib/recruitmentDisplay';
import { clubCategoryLabel } from '../_lib/clubCategoryLabel';

type Props = {
  club: ClubDetail;
  /** 활성 모집의 displayStatus. 모집이 없으면 undefined. */
  recruitmentDisplayStatus?: RecruitmentDisplayStatus;
};

/**
 * Breadcrumb + 로고/이름/카테고리/상태 칩 + 본문 한 줄 소개.
 * 디자인 원본: handoff/reference_jsx/a-detail.jsx (좌측 identity 영역)
 *
 * 누락 필드(창설년도/기수)는 표시하지 않는다.
 */
export function ClubDetailHero({ club, recruitmentDisplayStatus }: Props) {
  const categoryLabel = clubCategoryLabel(club.category);
  const initial = club.name.trim().charAt(0);

  return (
    <>
      {/* Breadcrumb */}
      <div className="border-b border-line bg-cream">
        <div className="max-w-layout mx-auto px-10 py-4 text-[12.5px] text-charcoal-3">
          동아리 탐색 / <span>{categoryLabel}</span> /{' '}
          <span className="font-semibold text-ink">{club.name}</span>
        </div>
      </div>

      <section className="bg-cream px-10 pt-11 pb-8">
        <div className="max-w-layout mx-auto">
          <div className="mb-8 flex items-start gap-6">
            {/* Logo block */}
            <div
              className="
                relative grid h-[140px] w-[140px] shrink-0 place-items-center
                rounded-[28px] text-white shadow-2 overflow-hidden
              "
              style={{ background: 'linear-gradient(135deg, #1F4A36 0%, #2E6149 100%)' }}
            >
              {club.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-[56px] font-bold leading-none">
                  {initial}
                </span>
              )}
            </div>

            <div className="flex-1 pt-2">
              <div className="mb-3.5 flex items-center gap-2">
                <span className="pill">{categoryLabel}{club.division ? ` · ${club.division}` : ''}</span>
                {recruitmentDisplayStatus && (
                  <span className="pill solid">
                    {displayStatusLabel(recruitmentDisplayStatus)}
                  </span>
                )}
              </div>
              <h1 className="mb-4 text-[56px] leading-none tracking-tightx">{club.name}</h1>
              {club.description && (
                <p className="max-w-[580px] text-lg leading-relaxed text-charcoal-2 line-clamp-2">
                  {club.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
```

> `.pill`, `.pill.solid` 는 globals.css `@layer components` 에 정의된 기존 클래스. 미존재 시 `bg-paper border border-line text-charcoal px-3 py-1 rounded-full text-xs font-semibold` / `bg-ink text-white ...` 로 대체.

- [ ] **Step 2: 타입체크**

Run: `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx
git commit -m "feat(frontend): ClubDetailHero 컴포넌트 추가"
```

---

## Task 3: `ClubDetailAbout` — 본문 description

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
type Props = { description: string | null };

/**
 * 동아리 소개 본문. description 이 비어 있으면 섹션 자체를 숨긴다.
 * 디자인 원본에 있는 "이런 사람이 좋아할 거예요" / "주요 프로젝트" 블록은
 * 해당 데이터가 API에 없으므로 표시하지 않는다.
 */
export function ClubDetailAbout({ description }: Props) {
  if (!description) return null;
  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      <p className="whitespace-pre-wrap">{description}</p>
    </article>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx
git commit -m "feat(frontend): ClubDetailAbout 컴포넌트 추가"
```

---

## Task 4: `ClubDetailPhotos` — 4열 그리드 + `+N` 오버레이

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailPhotos.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import type { ClubPhoto } from '@duing/types';

type Props = { photos: ClubPhoto[] };

/**
 * 활동 사진 그리드. 최대 8장 표시, 8장을 초과하면 마지막 칸에 +N 오버레이.
 * 사진이 0장이면 섹션을 숨긴다.
 */
export function ClubDetailPhotos({ photos }: Props) {
  if (photos.length === 0) return null;

  const visible = photos.slice(0, 8);
  const remainder = Math.max(0, photos.length - 8);

  return (
    <section className="mt-12">
      <h3 className="mb-4 text-lg font-bold text-ink-deep">
        활동 사진 · {photos.length}장
      </h3>
      <div className="grid grid-cols-4 gap-3">
        {visible.map((photo, index) => {
          const isLast = index === visible.length - 1;
          const showOverlay = isLast && remainder > 0;
          return (
            <div
              key={photo.id}
              className="
                relative aspect-square overflow-hidden rounded-[14px]
                border border-line bg-sage-mist
              "
            >
              <img
                src={photo.storageKey}
                alt={photo.caption ?? ''}
                className="h-full w-full object-cover"
              />
              {showOverlay && (
                <div
                  className="
                    absolute inset-0 grid place-items-center
                    rounded-[14px] bg-ink/70 font-display text-[22px] font-bold text-white
                  "
                >
                  +{remainder}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailPhotos.tsx
git commit -m "feat(frontend): ClubDetailPhotos 컴포넌트 추가"
```

---

## Task 5: `ClubRecruitmentCard` — 학생측 모집 통합 핵심

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import type { RecruitmentSummary } from '@duing/types';
import { useAuthStore } from '@duing/stores';
import {
  displayStatusLabel,
  recruitmentDaysLeft,
  recruitmentPeriodLabel,
} from '../../../_lib/recruitmentDisplay';
import { toRoute } from '../../../_lib/route';
import { FavoriteToggleButton } from '../../_components/FavoriteToggleButton';

type Props = {
  /** 진행 중인 모집(없으면 undefined). 모집중·예정·상시·마감 모두 받아 처리한다. */
  recruitment: RecruitmentSummary | undefined;
  clubId: number;
};

/**
 * 우측 sticky 모집 카드. 활성 모집이 있으면 정보 + 지원하기 버튼을, 없으면 안내 + 비활성 버튼을 노출한다.
 * 디자인 원본: handoff/reference_jsx/a-detail.jsx (우측 sticky 카드)
 *
 * 누락 필드(면접 일정, 회비, 모집 목표 인원, 지원자 누적 수) 는 표시하지 않는다.
 */
export function ClubRecruitmentCard({ recruitment, clubId }: Props) {
  const authStatus = useAuthStore((state) => state.status);
  const router = useRouter();

  const status = recruitment?.displayStatus;
  const canApply = status === 'OPEN' || status === 'ALWAYS_OPEN';
  const daysLeft = recruitment ? recruitmentDaysLeft(recruitment.endDate) : null;

  const header = (() => {
    if (!recruitment) return '모집 없음';
    if (status === 'OPEN' && daysLeft !== null) return `모집중 · D-${daysLeft}`;
    if (status === 'ALWAYS_OPEN') return '상시모집';
    if (status === 'UPCOMING') return `모집예정 · ${recruitment.startDate}부터`;
    return '모집마감';
  })();

  const heading = (() => {
    if (!recruitment) return '현재 진행 중인\n모집이 없습니다';
    if (status === 'OPEN') return '지금 바로\n지원할 수 있어요';
    if (status === 'ALWAYS_OPEN') return '언제든\n지원할 수 있어요';
    if (status === 'UPCOMING') return '곧 모집이\n시작돼요';
    return '이번 모집은\n종료됐어요';
  })();

  const applyButtonLabel = recruitment?.applicationMode === 'EXTERNAL'
    ? '외부 폼으로 이동'
    : '지원하기';

  function handleApply() {
    if (!recruitment || !canApply) return;
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      window.open(recruitment.externalFormUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath: `/${string}` = `/apply/${recruitment.id}`;
    if (authStatus !== 'authenticated') {
      router.push(toRoute(`/login?next=${encodeURIComponent(applyPath)}`));
      return;
    }
    router.push(toRoute(applyPath));
  }

  return (
    <aside className="space-y-4">
      <div className="sticky top-6 rounded-[24px] border border-line bg-paper p-7 shadow-2">
        <div className="mb-3 text-xs font-bold tracking-wide06 text-ink">
          {header}
        </div>
        <h3 className="mb-5 whitespace-pre-line font-body text-2xl font-bold text-ink-deep">
          {heading}
        </h3>

        {recruitment && (
          <div className="mb-5 flex flex-col gap-3.5 text-sm">
            <Row
              label="모집 인원"
              value={`${recruitment.capacity}명${recruitment.useInterview ? ' (서류 + 면접)' : ' (서류)'}`}
            />
            <Row
              label="모집 기간"
              value={recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
            />
            <Row
              label="모집 대상"
              value={recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'}
            />
            <Row label="상태" value={displayStatusLabel(recruitment.displayStatus)} last />
          </div>
        )}

        {recruitment?.targetRole === 'OFFICER' && (
          <p className="mb-5 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            ⚠ 이 모집은 운영진 모집입니다. 이 동아리의 기존 부원만 지원할 수 있습니다.
          </p>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="btn primary big mb-2.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applyButtonLabel}
        </button>

        <div className="flex gap-2">
          <div className="flex-1">
            <FavoriteToggleButton clubId={clubId} size="md" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${last ? '' : 'border-b border-dashed border-line pb-3'}`}>
      <div className="w-20 text-[12.5px] text-charcoal-3">{label}</div>
      <div className="flex-1 font-semibold text-charcoal">{value}</div>
    </div>
  );
}
```

> **호환 확인:** `FavoriteToggleButton` 의 prop 이 `size?: 'sm' | 'md' | 'lg'` 인지 파일을 열어 확인. 다르면 props 그대로 맞춘다.

- [ ] **Step 2: 타입체크**

Run: `pnpm -w typecheck`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx
git commit -m "feat(frontend): ClubRecruitmentCard로 학생측 지원 흐름 통합"
```

---

## Task 6: `ClubContactCard` — sage-mist 톤 미니 카드

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import type { ClubSnsLink } from '@duing/types';

type Props = { snsLinks: ClubSnsLink[] };

/**
 * SNS 연락 정보를 sage-mist 톤 미니 카드로 표시.
 * 위치/이메일은 API에 없으므로 표시하지 않으며, snsLinks 가 비면 카드를 숨긴다.
 */
export function ClubContactCard({ snsLinks }: Props) {
  if (snsLinks.length === 0) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {snsLinks.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {link.platform} · {link.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx
git commit -m "feat(frontend): ClubContactCard 컴포넌트 추가"
```

---

## Task 7: `ClubRecruitmentCard` 단위 테스트

**Files:**
- Create: `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClubRecruitmentCard } from '@/clubs/[clubId]/_components/ClubRecruitmentCard';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('@duing/stores', () => ({ useAuthStore: () => 'unauthenticated' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../app/_components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: () => <button>찜하기</button>,
}));

const base: RecruitmentSummary = {
  id: 1,
  clubId: 7,
  clubName: '두잉',
  title: 'X',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  capacity: 10,
  status: 'OPEN',
  displayStatus: 'OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
};

describe('ClubRecruitmentCard', () => {
  it('모집 없음이면 비활성 지원 버튼과 안내 문구', () => {
    render(<ClubRecruitmentCard recruitment={undefined} clubId={7} />);
    expect(screen.getByText('모집 없음')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '지원하기' });
    expect(button).toBeDisabled();
  });

  it('상시모집이면 "상시모집" 헤더 + 활성 지원 버튼 + 기간이 "상시모집"', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, displayStatus: 'ALWAYS_OPEN', endDate: null }}
        clubId={7}
      />,
    );
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
    expect(screen.getAllByText('상시모집').length).toBeGreaterThan(0);
  });

  it('CLOSED 면 지원 버튼이 비활성화된다', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, displayStatus: 'CLOSED', status: 'CLOSED' }}
        clubId={7}
      />,
    );
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('EXTERNAL 모집이면 버튼 라벨이 "외부 폼으로 이동"', () => {
    render(
      <ClubRecruitmentCard
        recruitment={{ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://x' }}
        clubId={7}
      />,
    );
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행**

Run: `pnpm --filter web test -- --run club-recruitment-card`
Expected: 4건 PASS

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/test/clubs/club-recruitment-card.test.tsx
git commit -m "test(frontend): ClubRecruitmentCard 단위 테스트"
```

---

## Task 8: `page.tsx` 전체 재작성 — 컴포넌트 조립

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx`

- [ ] **Step 1: 파일 전체 교체**

```tsx
'use client';

import { use } from 'react';
import { useClubDetailQuery, useClubRecruitmentsQuery, useClubPhotosQuery } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';
import { ClubDetailHero } from './_components/ClubDetailHero';
import { ClubDetailAbout } from './_components/ClubDetailAbout';
import { ClubDetailPhotos } from './_components/ClubDetailPhotos';
import { ClubRecruitmentCard } from './_components/ClubRecruitmentCard';
import { ClubContactCard } from './_components/ClubContactCard';

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const detail = useClubDetailQuery(clubId);
  const photos = useClubPhotosQuery(clubId);
  const recruitments = useClubRecruitmentsQuery(clubId);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;
  const activeRecruitment: RecruitmentSummary | undefined = recruitments.data?.find(
    (item) => item.displayStatus === 'OPEN' || item.displayStatus === 'ALWAYS_OPEN',
  );

  return (
    <div className="bg-cream min-h-screen">
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-[1fr_380px] gap-12">
          {/* Left column */}
          <div>
            <ClubDetailAbout description={club.description} />
            <ClubDetailPhotos photos={photos.data ?? []} />

            {club.faqs.length > 0 && (
              <section className="mt-12">
                <h3 className="mb-4 text-lg font-bold text-ink-deep">FAQ</h3>
                <ul className="space-y-3">
                  {club.faqs
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((faq, idx) => (
                      <li key={idx} className="rounded-[14px] border border-line bg-paper p-4">
                        <p className="font-semibold text-ink-deep">Q. {faq.question}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal-2">
                          {faq.answer}
                        </p>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>

          {/* Right column — sticky cards */}
          <div className="space-y-4">
            <ClubRecruitmentCard recruitment={activeRecruitment} clubId={clubId} />
            <ClubContactCard snsLinks={club.snsLinks} />
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 빌드**

Run: `pnpm -w typecheck && pnpm --filter web build`
Expected: SUCCESS

- [ ] **Step 3: 브라우저에서 동작 확인**

Run: `pnpm --filter web dev`
브라우저 접속: `http://localhost:3000/clubs/1`
확인:
- Hero 영역 displayStatus 칩이 활성 모집 상태와 일치
- 우측 sticky 카드: 활성 모집 시 "지원하기" 활성. 없으면 "모집 없음" + 비활성
- 사진/FAQ/SNS 가 데이터 유무에 따라 자연스럽게 숨겨짐

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/clubs/[clubId]/page.tsx
git commit -m "feat(frontend): 학생측 동아리 상세 페이지 디자인 포팅 + 모집 통합"
```

---

## Task 9: 별도 모집 상세 라우트 제거 + 잔존 링크 교체

**Files:**
- Delete: `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/page.tsx`
- Modify: `frontend/apps/web/app/calendar/page.tsx`

- [ ] **Step 1: 학생측 모집 상세 페이지 삭제**

```bash
rm frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx
# 디렉터리가 비면 정리
rmdir frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId] \
      frontend/apps/web/app/clubs/[clubId]/recruitments 2>/dev/null || true
```

- [ ] **Step 2: `apply/[recruitmentId]/page.tsx` 의 취소 경로 교체**

기존 `apps/web/app/apply/[recruitmentId]/page.tsx:37`:

```tsx
toRoute(`/clubs/${recruitment.clubId}/recruitments/${recruitment.id}`),
```

→ 변경 (모집 상세 대신 동아리 상세로 돌아간다):

```tsx
toRoute(`/clubs/${recruitment.clubId}`),
```

- [ ] **Step 3: 캘린더의 모집 링크 교체**

기존 `apps/web/app/calendar/page.tsx:37`:

```tsx
<Link href={`/clubs/${recruitment.clubId}/recruitments/${recruitment.id}`}>
```

→ 변경:

```tsx
<Link href={`/clubs/${recruitment.clubId}`}>
```

- [ ] **Step 4: 잔존 grep 확인**

```bash
grep -rn "/clubs/.*recruitments/" frontend/apps/web --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" \
  | grep -v "/manage/" | grep -v "/apply/"
```
Expected: **0건**. 관리자(`/manage/...`) 와 apply 외 학생측 경로에 잔재 없음.

- [ ] **Step 5: 타입체크 + 빌드 + 테스트**

```bash
pnpm -w typecheck
pnpm --filter web build
pnpm --filter web test -- --run
```
Expected: 전 단계 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/apply/[recruitmentId]/page.tsx \
        frontend/apps/web/app/calendar/page.tsx
git add -A frontend/apps/web/app/clubs  # 삭제 반영
git commit -m "refactor(frontend): 학생측 별도 모집 상세 라우트 제거 + 잔존 링크 교체"
```

---

## Task 10: PR 생성

- [ ] **Step 1: PR 본문 작성**

```bash
git push -u origin feat/club-detail-redesign-and-recruitment-integration
gh pr create --base develop --title "feat(frontend): 동아리 상세 디자인 포팅 + 모집 통합 흐름" --body "$(cat <<'EOF'
## 🚀 작업 내용
- handoff ADetail 디자인을 학생측 동아리 상세 페이지로 옮겨 좌측 identity, 우측 sticky 모집 카드 레이아웃을 만들었습니다.
- 동아리 상세 페이지에서 "지원하기" 버튼을 곧바로 누를 수 있도록 모집 흐름을 통합하고, 별도 모집 상세 페이지를 제거했습니다.
- 활성 모집이 없을 때는 안내 문구와 비활성 버튼을 그대로 노출해 학생에게 명확한 피드백을 줍니다.

## 🤔 고민했던 내용
- 디자인에는 창설년도, 기수, 회비, 위치 등 API에 없는 필드가 많아 행/섹션 단위 조건부 렌더링으로 모두 숨겼습니다. 추후 모델 확장은 별도 작업으로 분리했습니다.
- 캘린더와 apply 페이지가 모집 상세 라우트로 돌아오는 링크를 갖고 있어 모두 동아리 상세로 교체했습니다.

## 💬 리뷰 중점사항
- ClubRecruitmentCard 의 상태별 헤더/버튼 라벨(모집중·상시모집·예정·마감·없음)이 의도대로 매핑되는지 확인 부탁드립니다.
- 학생측 모집 상세 라우트 삭제로 끊긴 링크가 없는지 grep 결과를 봐주세요.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지** — 스펙 §2 (모집 통합 흐름/라우트 제거/잔존 링크) 와 §4 (디자인 포팅/누락 필드 처리 표) 의 모든 행이 Task 2~9 에 매핑.
- [x] **플레이스홀더 검사** — TBD/TODO 없음. 모든 컴포넌트가 완성 코드.
- [x] **타입 일관성** — `RecruitmentSummary` 의 `displayStatus`, `endDate: string | null` 가 Hero/Card/Page 전부 동일하게 사용. `RecruitmentDisplayStatus` 값 4종이 Card 의 분기에서 누락 없음.
- [x] **DRY** — 라벨/기간/D-day 계산은 PR2 에서 만든 `_lib/recruitmentDisplay.ts` 만 사용.
- [x] **YAGNI** — 누락 필드 자리에 placeholder 표시를 두지 않고 완전히 숨겨 UI 잡음 제거.
- [x] **잔존 링크 확인 단계 명시** — Task 9 Step 4 grep 으로 검증.
