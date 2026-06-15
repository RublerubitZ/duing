# 마이페이지 "지난 지원" 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마이페이지에 4번째 탭 "지난 지원" 을 추가해 학생이 자신의 ACCEPTED/REJECTED 지원 이력을 시간순으로 회고할 수 있게 만든다.

**Architecture:** Frontend-only. `useMyApplicationsQuery('ARCHIVED')` 호출을 마이페이지에 하나 더 추가하고, `SectionArchived` 컴포넌트를 새로 만들어 단일 목록 + status pill (`🎉 합격` / `📝 불합격`) 로 렌더한다. `SECTIONS` 배열과 `SectionId` 타입에 `'archived'` 항목을 더해 기존 탭 인프라(스크롤 스파이, anchor, 카운트 badge) 가 자동으로 새 탭을 흡수한다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / Vitest + React Testing Library / Tailwind. 백엔드 변경 없음.

**Spec:** `docs/superpowers/specs/2026-05-28-mypage-archived-applications-tab-design.md`

---

## File Structure

### Create
- `frontend/apps/web/app/me/_components/SectionArchived.tsx` — archived 지원 목록 섹션 (단일 책임: status pill 렌더 + 상세 페이지 링크 + 빈 상태)
- `frontend/apps/web/test/me/section-archived.test.tsx` — 4개의 단위 테스트

### Modify
- `frontend/apps/web/app/me/_pages/MyPage.tsx` — `SectionId` union, `SECTIONS` 배열, 신규 query, count source, 섹션 마운트

### Untouched
- 백엔드 — 변경 없음
- 다른 섹션 컴포넌트 (`SectionApply`, `SectionMyClubs`, `SectionSaved`, `AcceptanceBanner`) — 변경 없음
- `MyPageHeader`, `MyPageTabs` — 변경 없음 (기존 인프라 재사용)
- `useMyApplicationsQuery` 훅 — 변경 없음 (이미 scope 인자 지원)

---

## PR Strategy

단일 PR: `feat/fe-mypage-archived-applications`.

3 commits 순서:
1. `SectionArchived` 컴포넌트 + 테스트 (Task 2)
2. `MyPage` 재배선 — 4번째 탭 추가 (Task 3)
3. 브라우저 수동 확인 후 push & PR 생성 (Task 4)

---

## Task 1: 브랜치 분기

**Files:** —

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/fe-mypage-archived-applications
cd frontend && pnpm install
```

---

## Task 2: SectionArchived 컴포넌트 + 테스트 (TDD)

**Files:**
- Create: `frontend/apps/web/app/me/_components/SectionArchived.tsx`
- Create: `frontend/apps/web/test/me/section-archived.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`frontend/apps/web/test/me/section-archived.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@duing/types';

import { SectionArchived } from '../../app/me/_components/SectionArchived';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (overrides: Partial<ApplicationSummary> = {}): ApplicationSummary => ({
  id: 1,
  recruitmentId: 100,
  recruitmentTitle: '봄 신입 모집',
  clubId: 10,
  clubName: '두잉 댄스',
  category: 'CULTURE',
  logoUrl: null,
  status: 'ACCEPTED',
  interviewAt: null,
  interviewLocation: null,
  submittedAt: '2026-04-15T10:00:00Z',
  ...overrides,
});

describe('SectionArchived', () => {
  it('ACCEPTED 카드는 "🎉 합격" pill 과 /me/applications/{id} 링크를 노출한다', () => {
    render(<SectionArchived applications={[make({ id: 5, status: 'ACCEPTED', clubName: '합격동' })]} />);
    expect(screen.getByText(/🎉\s*합격/)).toBeInTheDocument();
    expect(screen.getByText('합격동')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /합격동/ });
    expect(link).toHaveAttribute('href', '/me/applications/5');
  });

  it('REJECTED 카드는 "📝 불합격" pill 과 상세 링크를 노출한다', () => {
    render(<SectionArchived applications={[make({ id: 7, status: 'REJECTED', clubName: '불합격동' })]} />);
    expect(screen.getByText(/📝\s*불합격/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /불합격동/ });
    expect(link).toHaveAttribute('href', '/me/applications/7');
  });

  it('빈 배열이면 안내 문구와 동아리 탐색 링크가 노출된다', () => {
    render(<SectionArchived applications={[]} />);
    expect(screen.getByText(/지난 지원 내역이 없어요/)).toBeInTheDocument();
    const exploreLink = screen.getByRole('link', { name: /동아리 탐색하러 가기/ });
    expect(exploreLink).toHaveAttribute('href', '/clubs');
  });

  it('카운트 헤더에 총 개수가 반영된다', () => {
    render(
      <SectionArchived
        applications={[
          make({ id: 1, status: 'ACCEPTED' }),
          make({ id: 2, status: 'REJECTED' }),
          make({ id: 3, status: 'ACCEPTED' }),
        ]}
      />,
    );
    expect(screen.getByText(/지난 지원 · 3/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter web test -- section-archived 2>&1 | tail -10
```

Expected: FAIL — cannot find module `../../app/me/_components/SectionArchived`.

- [ ] **Step 3: 컴포넌트 작성**

`frontend/apps/web/app/me/_components/SectionArchived.tsx`:

```tsx
import Link from 'next/link';

import type { ApplicationStatus, ApplicationSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

type ArchivedStatus = Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>;

const PILL: Record<ArchivedStatus, { label: string; className: string }> = {
  ACCEPTED: {
    label: '🎉 합격',
    className: 'bg-sage-mist text-ink-deep border-sage-mist',
  },
  REJECTED: {
    label: '📝 불합격',
    className: 'bg-paper text-charcoal-3 border-line',
  },
};

const isArchivedStatus = (status: ApplicationStatus): status is ArchivedStatus =>
  status === 'ACCEPTED' || status === 'REJECTED';

const formatSubmittedAt = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

type Props = {
  applications: ApplicationSummary[];
};

export function SectionArchived({ applications }: Props) {
  return (
    <section
      data-section="archived"
      id="sec-archived"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`지난 지원 · ${applications.length}`}
          hint="합격 또는 불합격으로 마무리된 지원 내역입니다."
        />

        {applications.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            지난 지원 내역이 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {applications.map((app) => {
              if (!isArchivedStatus(app.status)) return null;
              const pill = PILL[app.status];

              return (
                <Link
                  key={app.id}
                  href={`/me/applications/${app.id}`}
                  aria-label={`${app.clubName} 지원 상세`}
                  className={cn(
                    'bg-paper border border-line rounded-[18px] px-5 py-5',
                    'flex items-center gap-4',
                    'transition-[transform,box-shadow] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2',
                  )}
                >
                  <div
                    className="w-14 h-14 rounded-[14px] grid place-items-center text-[26px] shrink-0 bg-sage-mist text-ink-deep"
                  >
                    {app.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={app.logoUrl}
                        alt={app.clubName}
                        className="w-full h-full object-cover rounded-[14px]"
                      />
                    ) : (
                      '🏛'
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-semibold text-charcoal-3 mb-0.5">
                      {app.recruitmentTitle}
                    </div>
                    <h3 className="text-[16px] font-bold text-ink-deep">{app.clubName}</h3>
                    <div className="text-[12px] text-charcoal-3 font-mono mt-1">
                      {formatSubmittedAt(app.submittedAt)}
                    </div>
                  </div>

                  <span className={cn('pill text-[10.5px] border', pill.className)}>
                    {pill.label}
                  </span>

                  <ArrowRight size={14} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm --filter web test -- section-archived 2>&1 | tail -15
```

Expected: 4 PASS.

- [ ] **Step 5: typecheck**

```bash
pnpm --filter web typecheck 2>&1 | tail -10
```

Expected: clean (현재 `MyPage.tsx` 가 `SectionArchived` 를 import 하고 있지 않으므로 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/me/_components/SectionArchived.tsx \
        frontend/apps/web/test/me/section-archived.test.tsx
git commit -m "feat(me): SectionArchived 컴포넌트 추가 (지난 지원 단일 목록 + 상태 pill)"
```

EXACT 커밋 메시지. Co-Authored-By 금지.

---

## Task 3: MyPage 에 "지난 지원" 탭 마운트

**Files:**
- Modify: `frontend/apps/web/app/me/_pages/MyPage.tsx`

- [ ] **Step 1: 현재 파일 읽기**

```bash
sed -n '1,40p' frontend/apps/web/app/me/_pages/MyPage.tsx
```

핵심 라인:
- L16: `type SectionId = 'apply' | 'joined' | 'saved';`
- L18-22: `SECTIONS` 배열 (apply / joined / saved)
- L33-38: 쿼리 호출들
- L139-145: `sectionsWithCount.map` 의 count 분기
- L168-173: 섹션 렌더

- [ ] **Step 2: 타입 union 확장**

L16 변경:
```tsx
type SectionId = 'apply' | 'joined' | 'saved' | 'archived';
```

L18-22 `SECTIONS` 배열 변경:
```tsx
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'apply', label: '지원 현황' },
  { id: 'joined', label: '가입한 동아리' },
  { id: 'saved', label: '찜한 동아리' },
  { id: 'archived', label: '지난 지원' },
];
```

- [ ] **Step 3: SectionArchived import 추가**

기존 `SectionSaved` import 아래 한 줄 추가 (알파벳 순서 무시 — 디렉토리에 등장 순):

```tsx
import { SectionArchived } from '../_components/SectionArchived';
```

위치는 `SectionApply` / `SectionMyClubs` / `SectionSaved` 인접한 import 블록 내.

- [ ] **Step 4: archived 쿼리 추가**

`useMyApplicationsQuery('ACTIVE')` 호출 바로 아래 한 줄 추가:

```tsx
const applicationsQuery = useMyApplicationsQuery('ACTIVE');
const archivedApplicationsQuery = useMyApplicationsQuery('ARCHIVED');
const myClubsQuery = useMyClubsQuery();
const favoriteListQuery = useFavoriteListQuery(0, 20);
```

derived data 변수도 추가 (기존 `applications`/`myClubs`/`favorites` 인접):

```tsx
const applications = applicationsQuery.data ?? [];
const archivedApplications = archivedApplicationsQuery.data ?? [];
const myClubs = myClubsQuery.data ?? [];
const favorites = favoriteListQuery.data?.content ?? [];
```

- [ ] **Step 5: count 분기 추가**

`sectionsWithCount` 매핑 변경 — 기존:

```tsx
const sectionsWithCount = SECTIONS.map((section) => {
  const count =
    section.id === 'apply'
      ? applications.length
      : section.id === 'joined'
        ? myClubs.length
        : favorites.length;
  return { ...section, count };
});
```

변경 후:

```tsx
const sectionsWithCount = SECTIONS.map((section) => {
  const count =
    section.id === 'apply'
      ? applications.length
      : section.id === 'joined'
        ? myClubs.length
        : section.id === 'saved'
          ? favorites.length
          : archivedApplications.length;
  return { ...section, count };
});
```

- [ ] **Step 6: 섹션 렌더에 archived 추가**

기존 (SectionSaved 까지):

```tsx
<div ref={refFor('saved')} data-section="saved">
  <SectionSaved favorites={favorites} />
</div>

{/* 마지막 섹션이 탭 클릭 시 충분히 스크롤될 수 있도록 하는 스페이서 */}
<div aria-hidden className="shrink-0" style={{ height: 420 }} />
```

변경 후 — saved 뒤에 archived 추가:

```tsx
<div ref={refFor('saved')} data-section="saved">
  <SectionSaved favorites={favorites} />
</div>
<div ref={refFor('archived')} data-section="archived">
  <SectionArchived applications={archivedApplications} />
</div>

{/* 마지막 섹션이 탭 클릭 시 충분히 스크롤될 수 있도록 하는 스페이서 */}
<div aria-hidden className="shrink-0" style={{ height: 420 }} />
```

- [ ] **Step 7: 빌드 + typecheck + 전체 테스트**

```bash
pnpm --filter web typecheck 2>&1 | tail -10
pnpm --filter web build 2>&1 | tail -15
pnpm --filter web test 2>&1 | tail -15
```

Expected:
- typecheck: clean
- build: success (route `/me` 사이즈가 약간 늘어남)
- test: 모든 테스트 PASS (`section-archived` 4개 포함)

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/me/_pages/MyPage.tsx
git commit -m "feat(me): MyPage 에 '지난 지원' 4번째 탭 마운트"
```

EXACT 메시지. Co-Authored-By 금지.

---

## Task 4: 브라우저 수동 확인 → push → PR 생성

**Files:** —

- [ ] **Step 1: dev server 실행 (이미 떠 있으면 건너뜀)**

```bash
pnpm --filter web dev
```

`http://localhost:3000/me` 접속 (테스트 계정으로 로그인 — ACCEPTED 와 REJECTED 지원 데이터가 있는 계정).

- [ ] **Step 2: 수동 체크리스트**

다음 모두 확인:
1. 상단 탭에 `지원 현황 / 가입한 동아리 / 찜한 동아리 / 지난 지원` 4개가 보임
2. "지난 지원" 탭 클릭 → 해당 섹션으로 스무스 스크롤
3. 섹션 헤더 카운트 (`지난 지원 · N`) 가 실제 archived 지원 수와 일치
4. ACCEPTED 카드에 `🎉 합격` pill, REJECTED 카드에 `📝 불합격` pill
5. 카드 클릭 → `/me/applications/{id}` 상세 페이지 정상 진입
6. archived 가 없는 계정에서는 "지난 지원 내역이 없어요" 안내 + `/clubs` 링크
7. 진행 중인 지원 섹션은 active 상태만 (이전 작업의 회귀 없음 확인)
8. URL `localhost:3000/me#sec-archived` deep-link 가 해당 섹션으로 스크롤되는지

체크리스트의 6번을 확인하려면 archived 가 없는 계정으로도 한 번 들어가야 함. 한 계정으로 다 확인 안 되면 두 계정 사용.

문제가 있으면 fix commit 추가. 회귀 없으면 다음 step 진행.

- [ ] **Step 3: 브랜치 push**

```bash
git push -u origin feat/fe-mypage-archived-applications
```

- [ ] **Step 4: PR 생성**

```bash
gh pr create --base develop --title "feat(frontend): 마이페이지 '지난 지원' 탭 추가" --body "$(cat <<'EOF'
## 🚀 작업 내용
마이페이지에 4번째 탭 "지난 지원" 을 추가해 ACCEPTED / REJECTED 지원 이력을 회고형으로 조회할 수 있도록 했다. 백엔드는 PR-1 에서 이미 제공된 GET /users/me/applications?scope=ARCHIVED 를 그대로 사용한다.

- 새 컴포넌트 SectionArchived — 단일 목록, 상태 pill (🎉 합격 / 📝 불합격), 카드 클릭 시 기존 /me/applications/{id} 상세로 이동
- MyPage 의 SectionId / SECTIONS / 쿼리 / count 분기에 'archived' 추가
- DOM id sec-archived, data-section="archived" — 향후 deep-link 호환

## 🤔 고민했던 내용
탭 vs 별도 페이지 중에서 탭을 선택한 이유는 마이페이지가 이미 스크롤 기반 single-page 패턴이라 한 곳에서 자신의 활동 전반을 볼 수 있는 정합성이 더 컸기 때문이다. 합격(🎉)/불합격(📝) 톤 분리는 사용자 정서적 부담을 줄이기 위해 불합격에는 중립적인 문서 아이콘을 골랐다.

## 💬 리뷰 중점사항
- step bar 가 빠진 카드 레이아웃의 비주얼 밸런스
- 탭 순서 (apply → joined → saved → archived) 가 사용 빈도 순으로 자연스러운지
- 두 개의 useMyApplicationsQuery (ACTIVE + ARCHIVED) 가 동시에 발사되는 것의 비용 — query key 가 scope 로 분리되어 캐시 충돌은 없음
EOF
)"
```

Co-Authored-By, 🤖 Generated 금지.

- [ ] **Step 5: PR URL 반환**

머지는 사용자 측. PR URL 만 출력하고 종료.

---

## Self-Review

이 plan 의 모든 task 가 완료되면 spec(`docs/superpowers/specs/2026-05-28-mypage-archived-applications-tab-design.md`) 의 다음이 충족된다:

- [ ] §3 결정 사항 표의 8개 항목 — Task 2/3 에서 모두 구현
- [ ] §4.1 SectionArchived 컴포넌트 — Task 2
- [ ] §4.2 MyPage 변경 (SectionId, SECTIONS, query, count, render) — Task 3
- [ ] §4.3 영향 받지 않는 것 — 다른 섹션 컴포넌트와 백엔드는 손대지 않음
- [ ] §4.4 테스트 4개 — Task 2 step 1
- [ ] §5 단일 PR 전략 — Task 4

§7 미해결 항목 결정:
- 날짜 포맷: `yyyy.MM.dd` 사용 (Task 2 의 `formatSubmittedAt` 헬퍼)
- 카드 logo 슬롯: `SectionApply` 의 logoUrl 패턴 그대로 (Task 2 컴포넌트)
- pill 색상 토큰: `bg-sage-mist`/`bg-paper` + `border-line` — 기존 디자인 토큰 사용
