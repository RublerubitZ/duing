# 마이페이지 — "지난 지원" 탭 설계

> 작성일: 2026-05-28
> 범위: Frontend only. 백엔드는 이전 spec (`2026-05-27-mypage-acceptance-membership-split-design.md`) 에서 `/users/me/applications?scope=ARCHIVED` API 가 이미 제공됨.
> 사전 spec: §7 Out of Scope 의 "지난 지원" 페이지/탭 후속 구현.

---

## 1. 배경

이전 spec 에서 마이페이지의 "진행 중인 지원" 섹션은 ACCEPTED / REJECTED 를 제외한 active 상태(SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING) 만 보여주도록 변경되었다. 그 결과 학생이 합·불합 결과를 사후 조회할 자리가 사라졌다. 본 spec 은 마이페이지에 "지난 지원" 탭을 추가해 archived 상태 지원을 회고형으로 조회할 수 있게 한다.

## 2. 목표

- 학생이 마이페이지에서 한 탭 클릭으로 자신의 ACCEPTED / REJECTED 이력을 시간순으로 볼 수 있다.
- 각 카드에서 기존 `/me/applications/{id}` 상세 페이지로 진입해 제출 답변·면접 일정 등을 다시 확인할 수 있다.
- 합·불합 톤은 한쪽으로 치우치지 않게 — 합격은 축하 톤(`🎉`), 불합격은 중립 톤(`📝`) 으로 분리.

## 3. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| UI 형태 | 마이페이지 내 **4번째 탭**. 별도 페이지 / inline expand 아님 |
| 상태 그룹화 | 단일 목록, 카드별 status pill 로 구분 (필터 칩 / 서브섹션 분리 아님) |
| 카드 액션 | 상세 보기 1종. `/me/applications/{id}` 로 이동. "다시 지원" / "숨김" 없음 |
| 페이지네이션 | 없음. 백엔드가 반환하는 전체 List 그대로 렌더 |
| ACCEPTED pill | `🎉 합격` — sage 톤 (`bg-sage-mist text-ink-deep`) |
| REJECTED pill | `📝 불합격` — 중립 톤 (`bg-paper text-charcoal-3 border-line`) |
| Step bar | 노출 안 함 (terminal state — 단계 의미 없음) |
| `MyPageHeader` 통계 | 변경 없음. archived count 는 탭 badge 에만 노출 |

## 4. Frontend 설계

### 4.1 새 컴포넌트 `SectionArchived.tsx`

위치: `frontend/apps/web/app/me/_components/SectionArchived.tsx`

```tsx
'use client';

import Link from 'next/link';
import type { ApplicationSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

type ArchivedStatus = 'ACCEPTED' | 'REJECTED';

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

const isArchivedStatus = (s: string): s is ArchivedStatus =>
  s === 'ACCEPTED' || s === 'REJECTED';

type Props = {
  applications: ApplicationSummary[];
};

export function SectionArchived({ applications }: Props) {
  // 빈 상태 / 목록 렌더 (코드 형태는 SectionApply 와 유사)
}
```

**카드 레이아웃 (간단한 단일 행):**
```
┌──────────────────────────────────────────────────────────┐
│ 🏛  봄 신입 모집           [🎉 합격]                    > │
│     두잉 댄스 동아리                                       │
│     2026.04.15                                            │
└──────────────────────────────────────────────────────────┘
```

- 카드 outer: `Link` 로 감싸서 `/me/applications/${app.id}` 클릭 영역 확장
- step bar 없음 — 컴팩트
- 정렬: BE 반환 그대로 (`createdAt DESC` 보장)

**빈 상태:**
```
지난 지원 내역이 없어요.  [동아리 탐색하러 가기 →]
```

### 4.2 `MyPage.tsx` 변경

- `SECTIONS` 배열 4번째 항목 추가:
  ```ts
  { id: 'archived', label: '지난 지원' }
  ```
- `SectionId` union 에 `'archived'` 추가
- `useMyApplicationsQuery('ARCHIVED')` 호출 추가:
  ```tsx
  const archivedApplicationsQuery = useMyApplicationsQuery('ARCHIVED');
  const archivedApplications = archivedApplicationsQuery.data ?? [];
  ```
- `sectionsWithCount` 의 새 분기:
  ```ts
  section.id === 'archived' ? archivedApplications.length : ...
  ```
- 섹션 렌더:
  ```tsx
  <div ref={refFor('archived')} data-section="archived">
    <SectionArchived applications={archivedApplications} />
  </div>
  ```
- 탭 순서: `apply` → `joined` → `saved` → `archived` (가입한 동아리·찜한 동아리 다음에 회고성 항목)

> 두 개의 별개 `useMyApplicationsQuery` 호출 (`'ACTIVE'` + `'ARCHIVED'`) 은 query key 가 scope 로 분리되어 캐시 충돌 없음. PR-2 에서 도입한 `applicationQueryKeys.myList(scope)` 가 이를 보장.

### 4.3 영향 받지 않는 것

- `SectionApply` (진행중 지원) — props·로직 변경 없음
- `SectionMyClubs`, `SectionSaved`, `AcceptanceBanner` — 영향 없음
- `MyPageHeader` — 영향 없음 (archived count 노출 안 함)
- 백엔드 — 변경 없음
- 기존 `/me/applications/{id}` 상세 페이지 — 모든 status 의 단건 조회는 이미 가능

### 4.4 테스트 (vitest + RTL)

`frontend/apps/web/test/me/section-archived.test.tsx`:

1. ACCEPTED 카드는 "🎉 합격" pill + `/me/applications/{id}` 링크를 가진다
2. REJECTED 카드는 "📝 불합격" pill + 링크를 가진다
3. 빈 배열이면 안내 문구와 `/clubs` 탐색 링크가 노출된다
4. 카운트 헤더에 총 개수가 반영된다

정렬은 BE 책임이라 단위 테스트에서 검증하지 않음.

## 5. 작업 분리

단일 PR. 변경이 크지 않고 모든 변경이 같은 라우트(/me) 에 묶여 있음.

브랜치: `feat/fe-mypage-archived-applications`

작업 순서:
1. `SectionArchived.tsx` 작성 + 테스트
2. `MyPage.tsx` 에서 4번째 탭 추가 + 쿼리 + 섹션 마운트
3. 수동 확인 (dev server 에서 ACCEPTED/REJECTED 데이터로 검증)

## 6. Out of Scope (후속 / 보류)

- "다시 지원" 기능 — 부분 유니크 제약(`recruitment_id, user_id, deleted_at IS NULL`) 변경 필요. 별도 도메인 작업
- 사용자가 "이건 보고 싶지 않다" 로 archived 카드를 숨기는 soft-hide — `ClubMember` 수준이 아니라 `Application` 수준의 hide 필드 추가 필요
- 검색·필터 (status pill 외)
- 페이지네이션
- `MyPageHeader` 헤더 통계에 archived 합산
- ACCEPTED/REJECTED 비율 차트 등 시각화
- 합격·불합격 사유 피드백 (RP-* / Application 메타데이터 확장 필요)

## 7. 미해결 / Plan 에서 확정할 것

- 카드 아이콘 슬롯: 동아리 logoUrl 노출 — `SectionApply` 패턴을 그대로 차용
- 날짜 포맷: `submittedAt` 을 `yyyy.MM.dd` 로 표시 (kebab/dot 컨벤션은 코드베이스 다른 곳 확인 후 일치시킨다)
- pill 색상 토큰: sage-mist / charcoal-3 / line 등은 기존 디자인 토큰. 디자인 시스템에 더 적합한 토큰이 있으면 plan 단계에서 검토
