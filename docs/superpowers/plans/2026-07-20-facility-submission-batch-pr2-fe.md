# 학교 제출(Submission Batch) PR-2 프론트 구현 계획 — 제출 화면 (v2 개정)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **v2 개정(2026-07-20):** 운영 중심 개편(스펙 v2) 반영 — 기본 뷰=동아리별 그룹 목록(Accordion), 동아리명 부분 검색, 제출 여부 필터, 카드 라벨 재정의, **생성 후 CSV 자동 다운로드 제거**. Task 1·2 는 개정 전 완료분을 그대로 재사용(아래 완료 기록), Task 3~7 이 개정판이다.

**Goal:** 관리자 "학교 제출" 페이지의 제출 대기 탭 — 시설 선택 → 검색·필터·Summary 4카드 → **동아리 그룹 목록(기본)/시간표(보조)** 이원 뷰 → 예약 선택 → Batch 생성(토스트만, 자동 다운로드 없음).

**Architecture:** `/admin/facility-bookings/submission` 단일 페이지(탭 셸: 제출 대기 | 제출 이력(준비 중)). candidates API 1개가 summary+bookings 공급, 검색·제출 여부 필터·동아리 그룹핑은 전부 클라이언트 가공(단일 시설·31일 상한 소량). 선택 상태는 그룹 목록/시간표가 공유하는 `Set<bookingId>`.

**Tech Stack:** Next.js 15 App Router + React 19 / TanStack Query / ky(@duing/api) / Tailwind / vitest + testing-library(훅 모듈 모킹).

**스펙:** `docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md` **v2** — §7.1 이 이 PR 의 범위 (완료 처리·이력·상세는 PR-3/PR-4)

## Global Constraints

- 커밋: Conventional Commits 한국어(`feat(frontend): ...`), Co-Authored-By/🤖 라인 금지. **push·PR 생성 금지**
- `any`·`as` 금지(불가피하면 `unknown`+타입 가드), 타입 선언은 `type`, `interface` 금지
- 서버 상태는 TanStack Query 만, `@duing/api` 경유, `useEffect` 데이터 패칭 금지, TanStack Query 내부 모킹 금지 — **훅 모듈(vi.mock('@duing/hooks')) 모킹** 관례
- 용어(v2): 카드 라벨 `승인 완료 / 제출 필요 / 제출함 / 학교 등록 완료`, 제출 여부 필터 `전체 / 제출 필요 / 제출함`
- **Batch 생성 후 CSV 자동 다운로드 금지(v2)** — 성공 토스트 + 선택 초기화 + 무효화만. `useDownloadSubmissionCsvMutation`/`downloadBlobFile` 은 PR-4(상세 화면)용으로 유지하되 이 PR 의 페이지에서 사용하지 않는다
- 기본 뷰=목록(동아리 그룹), 토글 순서 `[목록] [시간표]`
- 로딩 LoadingGate·버튼 ButtonSpinner(텍스트 로딩 금지), 에러 `role="alert"`+다시 시도, Empty 는 "필터 결과 없음 vs 기간 내 없음" 구분
- 시간표: FullCalendar 등 신규 의존성 금지, `table-fixed`, 09~22 13칸, 모바일 `overflow-x-auto`+날짜 열 sticky
- Tailwind 실존 팔레트 토큰만(동적 조립 금지). 상태 색 맵은 `submissionBlockVisual`(Task 2 완료분) 단일 출처
- 선택 모델: 클릭(탭)=토글, 동아리 단위 일괄 선택(그룹 헤더 체크박스), 전체 선택/해제, Shift 범위 없음. selectable=false 는 선택 불가
- 시간표 블록 클릭 의미: selectable=선택 토글(상세는 hover 툴팁) / 비-selectable=우측 Sheet 상세
- 버튼·오버레이 클래스(`btn btn-primary` 등)는 기존 소비처(BookingActionDialog·MemberCsvDownloadPopover 등)와 대조 — 다르면 기존 관례가 정본
- 테스트 파일 위치 `apps/web/test/admin/facility-submission/`, 상대 날짜만(만료 개념 없는 순수 데이터 픽스처의 절대 문자열은 허용)
- 검증은 `frontend/` cwd: `pnpm --filter @duing/web test`, `pnpm typecheck` (`| tail` 금지)

**브랜치:** `feat/facility-submission-fe` (진행 중 — Task 1·2 커밋 존재)

---

### Task 1: 타입 + API 클라이언트 + 훅 + Blob 다운로드 헬퍼 — ✅ 완료

커밋 `c7affe3b`. 리뷰 통과(fable Approved·duing 위반 0). 산출물: `@duing/types` 의 `SubmissionCandidateBooking`(16필드)·`SubmissionSummaryCounts`·`SubmissionCandidatesResponse`·`SubmissionCandidatesParams`·`CreateSubmissionBatchPayload`·`CreateSubmissionBatchResult`, `client.admin.facilitySubmission.{candidates, create, downloadCsv(blobOk)}`, `useSubmissionCandidatesQuery(params|null)`·`useCreateSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation`, `downloadBlobFile`. **v2 무영향 — 그대로 소비한다.**

---

### Task 2: 시간표 렌더 계획 빌더 — ✅ 완료

커밋 `f1a0f6c3`+`8d195202`(판별력 보강, 13/13 GREEN). 산출물: `_lib/submissionTimetable.ts` 의 `SUBMISSION_HOURS`·`buildSubmissionRows`·`submissionBlockVisual`(상태 색 맵 단일 출처 — 그룹 목록 배지도 이걸 쓴다). **v2 무영향(시간표는 보조 뷰로 유지).**

---

### Task 3: SubmissionTimetable 컴포넌트 (+Tooltip·상세 Sheet) — 보조 뷰

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionTimetable.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionDetailSheet.tsx`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-timetable.test.tsx`

**Interfaces:**
- Consumes: Task 2 `buildSubmissionRows`/`submissionBlockVisual`/`SUBMISSION_HOURS`, Task 1 타입, `@/components/ui/sheet`
- Produces(Task 5 소비):
  - `SubmissionTimetable({ bookings, facilityName, selection, onToggleSelect, onShowDetail })` — `selection: ReadonlySet<number>`, `onToggleSelect(bookingId: number)`, `onShowDetail(booking: SubmissionCandidateBooking)`
  - `SubmissionDetailSheet({ booking, facilityName, onClose })` — `booking: SubmissionCandidateBooking | null`(null=닫힘)
- 용도(스펙 v2 §7.1): 시설 충돌 확인·특정 날짜 집중 예약 확인·운영 검토 — 기본 뷰가 아니라 보조 토글이다.

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { SubmissionTimetable } from '../../../app/admin/facility-bookings/submission/_components/SubmissionTimetable';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '합주부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-01',
    startTime: '18:00',
    endTime: '21:00',
    purpose: '정기 합주',
    attendeeCount: 30,
    status: 'APPROVED',
    submitted: false,
    selectable: true,
    submissionNo: null,
    decidedByName: '관리자',
    decidedAt: '2026-07-20T10:00:00',
    ...overrides,
  };
}

describe('SubmissionTimetable', () => {
  it('블록에 동아리명·시간·인원이 함께 표시된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('합주부')).toBeInTheDocument();
    expect(screen.getByText(/18:00~21:00/)).toBeInTheDocument();
    expect(screen.getByText(/30명/)).toBeInTheDocument();
  });

  it('인원이 없으면 사용목적을 대신 표시한다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ attendeeCount: null })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/정기 합주/)).toBeInTheDocument();
  });

  it('선택 가능한 블록 클릭은 선택 토글을 호출하고 aria-pressed 로 상태를 알린다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set([1])}
        onToggleSelect={onToggleSelect}
        onShowDetail={vi.fn()}
      />,
    );

    const block = screen.getByRole('button', { name: /합주부/ });
    expect(block).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(block);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('선택 불가 블록(제출함) 클릭은 상세 열람을 호출한다', () => {
    const onShowDetail = vi.fn();
    const submitted = makeBooking({ submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' });
    render(
      <SubmissionTimetable
        bookings={[submitted]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /합주부/ }));
    expect(onShowDetail).toHaveBeenCalledWith(submitted);
  });

  it('hover 툴팁 내용(신청자·연락처·승인자)이 렌더된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/홍길동/)).toBeInTheDocument();
    expect(screen.getByText(/010-1234-5678/)).toBeInTheDocument();
    expect(screen.getByText(/관리자/)).toBeInTheDocument();
  });

  it('CONFIRMED 블록에는 등록완료 뱃지가 붙는다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ status: 'CONFIRMED', selectable: false })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('등록완료')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable.test`
Expected: FAIL (컴포넌트 미존재)

- [ ] **Step 3: 구현**

`SubmissionTimetable.tsx`:

```tsx
'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import {
  SUBMISSION_HOURS,
  buildSubmissionRows,
  submissionBlockVisual,
} from '../_lib/submissionTimetable';

const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  bookings: SubmissionCandidateBooking[];
  facilityName: string;
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/**
 * 학교 제출 시간표(스펙 v2 §7.1 — 보조 뷰) — 세로=날짜·가로=시간(09~22 13칸), 예약=colSpan 병합 블록.
 * 용도: 시설 충돌·특정 날짜 집중 예약 확인. selectable 블록 클릭=선택 토글(상세는 hover 툴팁),
 * 그 외 블록 클릭=우측 Sheet 상세. 모바일은 가로 스크롤 + 날짜 열 sticky.
 */
export function SubmissionTimetable({ bookings, facilityName, selection, onToggleSelect, onShowDetail }: Props) {
  const rows = buildSubmissionRows(bookings);

  if (rows.length === 0) {
    return <p className="text-sm text-charcoal-3">이 기간에 표시할 예약이 없어요.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-16 bg-cream" aria-hidden />
            {SUBMISSION_HOURS.map((hour) => (
              <th key={hour} className="p-1 font-mono text-[10px] font-medium text-charcoal-3">
                {pad2(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dateIso}>
              <td className="sticky left-0 z-10 bg-cream pr-1.5 text-right align-middle">
                <span className="font-mono text-[11px] font-bold text-charcoal">
                  {row.dateIso.slice(5).replace('-', '/')}
                </span>
              </td>
              {row.entries.map((entry, columnIndex) => {
                if (entry.type === 'covered') return null;
                if (entry.type === 'empty') {
                  return (
                    <td key={columnIndex} className="p-[2px]">
                      <div aria-hidden className="h-12 rounded-[5px] border border-line/40" />
                    </td>
                  );
                }
                const { booking, colSpan } = entry;
                const visual = submissionBlockVisual(booking);
                const selected = selection.has(booking.bookingId);
                const subText =
                  booking.attendeeCount !== null ? `${booking.attendeeCount}명` : booking.purpose;
                return (
                  <td key={columnIndex} colSpan={colSpan} className="relative p-[2px]">
                    {/* group: hover 툴팁 트리거 — 라이브러리 없이 CSS 로만(경량 커스텀 툴팁, 스펙 §7.1). */}
                    <div className="group relative">
                      <button
                        type="button"
                        aria-pressed={booking.selectable ? selected : undefined}
                        aria-label={`${row.dateIso} ${booking.startTime}~${booking.endTime} ${booking.clubName ?? '동아리'}${selected ? ' · 선택됨' : ''}`}
                        onClick={
                          booking.selectable
                            ? () => onToggleSelect(booking.bookingId)
                            : () => onShowDetail(booking)
                        }
                        className={`flex h-12 w-full flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border px-1.5 py-1 text-left leading-tight motion-safe:transition-colors ${
                          selected ? 'border-sage bg-ink text-cream shadow-sm' : visual.container
                        }`}
                      >
                        <span className={`flex items-center gap-1 truncate text-[11px] font-bold ${selected ? 'text-cream' : visual.nameClass}`}>
                          <span className="truncate">{booking.clubName ?? '동아리'}</span>
                          {visual.badge !== null && (
                            <span className="shrink-0 rounded-sm border border-current px-0.5 text-[9px] font-medium">
                              {visual.badge}
                            </span>
                          )}
                        </span>
                        <span className={`truncate font-mono text-[10px] ${selected ? 'text-cream/80' : 'text-charcoal-3'}`}>
                          {booking.startTime}~{booking.endTime} · {subText}
                        </span>
                      </button>
                      {/* hover 툴팁 — jsdom 은 hover 를 못 내므로 내용 존재만 테스트(실브라우저 QA 로 위치 검증). */}
                      <div
                        role="presentation"
                        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-56 rounded-md border border-line bg-paper p-2 text-left text-[11px] leading-relaxed text-charcoal shadow-md group-hover:block"
                      >
                        <p className="font-bold text-ink-deep">{booking.clubName ?? '동아리'}</p>
                        <p>{facilityName} · {booking.reservationDate} {booking.startTime}~{booking.endTime}</p>
                        <p>신청자 {booking.applicantName ?? '-'} · {booking.contactPhone ?? '-'}</p>
                        <p>목적 {booking.purpose}{booking.attendeeCount !== null ? ` · ${booking.attendeeCount}명` : ''}</p>
                        <p>승인 {booking.decidedByName ?? '-'}{booking.decidedAt !== null ? ` · ${booking.decidedAt.slice(0, 10)}` : ''}</p>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`SubmissionDetailSheet.tsx`:

```tsx
'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { submissionBlockVisual } from '../_lib/submissionTimetable';

const STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '학교 등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

type Props = {
  booking: SubmissionCandidateBooking | null;
  facilityName: string;
  onClose: () => void;
};

/** 비-selectable 블록·목록 행의 상세 열람용 우측 Drawer(스펙 v2 §7.1). */
export function SubmissionDetailSheet({ booking, facilityName, onClose }: Props) {
  return (
    <Sheet open={booking !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right">
        {booking !== null && (
          <>
            <SheetHeader>
              <SheetTitle>{booking.clubName ?? '동아리'} 예약 상세</SheetTitle>
              <SheetDescription>
                {facilityName} · {booking.reservationDate} {booking.startTime}~{booking.endTime}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-4 space-y-2 text-sm text-charcoal">
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">상태</dt>
                <dd className={submissionBlockVisual(booking).nameClass}>
                  {STATUS_LABELS[booking.status]}
                  {booking.submitted && booking.submissionNo !== null ? ` · ${booking.submissionNo}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">신청자</dt><dd>{booking.applicantName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">연락처</dt><dd>{booking.contactPhone ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용목적</dt><dd className="text-right">{booking.purpose}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용인원</dt><dd>{booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">승인자</dt><dd>{booking.decidedByName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">승인일</dt>
                <dd>{booking.decidedAt !== null ? booking.decidedAt.slice(0, 10) : '-'}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-timetable.test`
Expected: PASS (6/6)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 시간표 뷰·예약 상세 Drawer 구현"
```

---

### Task 4: 동아리별 그룹 목록(Accordion) — 기본 뷰 (v2 신규)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_lib/submissionGroups.ts`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-club-group-list.test.tsx`

**Interfaces:**
- Consumes: Task 1 타입, Task 2 `submissionBlockVisual`
- Produces(Task 5 소비):
  - `buildClubGroups(bookings) → SubmissionClubGroup[]` — `{ clubId, clubName, bookings }`, 동아리명 오름차순(null 은 마지막), 그룹 내 날짜→시간→id 정렬
  - `SubmissionClubGroupList({ bookings, selection, onToggleSelect, onToggleMany, onShowDetail })` — `onToggleMany(bookingIds: number[], nextSelected: boolean)` (동아리 단위 일괄 선택·Task 5 의 전체 선택도 재사용)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { buildClubGroups } from '../../../app/admin/facility-bookings/submission/_lib/submissionGroups';
import { SubmissionClubGroupList } from '../../../app/admin/facility-bookings/submission/_components/SubmissionClubGroupList';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '밴드부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-01',
    startTime: '18:00',
    endTime: '21:00',
    purpose: '정기 합주',
    attendeeCount: 30,
    status: 'APPROVED',
    submitted: false,
    selectable: true,
    submissionNo: null,
    decidedByName: '관리자',
    decidedAt: '2026-07-20T10:00:00',
    ...overrides,
  };
}

describe('buildClubGroups', () => {
  it('동아리명 오름차순으로 그룹핑하고 그룹 안은 날짜→시간 순으로 정렬한다', () => {
    const groups = buildClubGroups([
      makeBooking({ bookingId: 3, clubId: 11, clubName: '방송국', startTime: '09:00', endTime: '10:00' }),
      makeBooking({ bookingId: 2, reservationDate: '2026-08-08' }),
      makeBooking({ bookingId: 1 }),
    ]);

    expect(groups.map((group) => group.clubName)).toEqual(['밴드부', '방송국']);
    expect(groups[0]!.bookings.map((booking) => booking.bookingId)).toEqual([1, 2]);
  });

  it('빈 입력은 빈 그룹 배열을 낸다', () => {
    expect(buildClubGroups([])).toEqual([]);
  });
});

describe('SubmissionClubGroupList', () => {
  const twoClubs = [
    makeBooking({ bookingId: 1 }),
    makeBooking({ bookingId: 2, reservationDate: '2026-08-08' }),
    makeBooking({ bookingId: 3, clubId: 11, clubName: '방송국', submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' }),
  ];

  it('동아리별 그룹 헤더에 이름·건수·선택 수가 표시된다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set([1])}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/밴드부/)).toBeInTheDocument();
    expect(screen.getByText(/2건 · 선택 1/)).toBeInTheDocument();
    expect(screen.getByText(/방송국/)).toBeInTheDocument();
    expect(screen.getByText(/1건/)).toBeInTheDocument();
  });

  it('그룹 헤더 체크박스는 그 동아리의 선택 가능 예약 전체를 일괄 토글한다', () => {
    const onToggleMany = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={onToggleMany}
        onShowDetail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '밴드부 전체 선택' }));
    expect(onToggleMany).toHaveBeenCalledWith([1, 2], true);
  });

  it('선택 가능 예약이 없는 그룹의 헤더 체크박스는 비활성이다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: '방송국 전체 선택' })).toBeDisabled();
  });

  it('행 체크박스는 selectable 만 활성이고 개별 토글을 호출한다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const submittedRow = screen.getByRole('checkbox', { name: /방송국 2026-08-01 선택/ });
    expect(submittedRow).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 선택/ }));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('그룹 접기 버튼은 행을 숨기고 aria-expanded 를 갱신한다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const bandToggle = screen.getByRole('button', { name: /밴드부/ });
    expect(bandToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(bandToggle);
    expect(bandToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /밴드부 2026-08-01 선택/ })).not.toBeInTheDocument();
  });

  it('행에 제출 업무 정보(요일 포함 예약일·시간·목적·인원·제출번호)가 표시되고 상세 버튼이 동작한다', () => {
    const onShowDetail = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    expect(screen.getAllByText(/08-01\(토\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/18:00~21:00/).length).toBeGreaterThan(0);
    expect(screen.getByText('SUB-20260801-001')).toBeInTheDocument();

    const bandGroup = screen.getByRole('group', { name: /밴드부/ });
    fireEvent.click(within(bandGroup).getAllByRole('button', { name: '상세' })[0]!);
    expect(onShowDetail).toHaveBeenCalledWith(twoClubs[0]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-club-group-list`
Expected: FAIL

- [ ] **Step 3: 구현**

`submissionGroups.ts`:

```ts
import type { SubmissionCandidateBooking } from '@duing/types';

export type SubmissionClubGroup = {
  clubId: number;
  clubName: string | null;
  bookings: SubmissionCandidateBooking[];
};

/**
 * 동아리별 그룹핑(스펙 v2 §7.1) — 월간 제출 업무의 기본 화면 단위.
 * 동아리명 오름차순(null 은 마지막), 그룹 내 날짜→시간→id 정렬.
 */
export function buildClubGroups(bookings: SubmissionCandidateBooking[]): SubmissionClubGroup[] {
  const byClub = new Map<number, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const clubBookings = byClub.get(booking.clubId) ?? [];
    clubBookings.push(booking);
    byClub.set(booking.clubId, clubBookings);
  }
  return [...byClub.entries()]
    .map(([clubId, clubBookings]) => ({
      clubId,
      clubName: clubBookings[0]?.clubName ?? null,
      bookings: [...clubBookings].sort(
        (left, right) =>
          left.reservationDate.localeCompare(right.reservationDate) ||
          left.startTime.localeCompare(right.startTime) ||
          left.bookingId - right.bookingId,
      ),
    }))
    .sort((left, right) => {
      if (left.clubName === null) return 1;
      if (right.clubName === null) return -1;
      return left.clubName.localeCompare(right.clubName, 'ko');
    });
}
```

`SubmissionClubGroupList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { SubmissionCandidateBooking } from '@duing/types';
import { submissionBlockVisual } from '../_lib/submissionTimetable';
import { buildClubGroups } from '../_lib/submissionGroups';

const STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-08-01' → '08-01(토)' — 로컬 자정 파싱(타임존 어긋남 방지). */
function formatDateWithWeekday(dateIso: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${dateIso}T00:00:00`).getDay()];
  return `${dateIso.slice(5)}(${weekday})`;
}

type Props = {
  bookings: SubmissionCandidateBooking[];
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onToggleMany: (bookingIds: number[], nextSelected: boolean) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/**
 * 동아리별 그룹 목록(Accordion, 스펙 v2 §7.1) — 월간 제출 업무의 기본 뷰.
 * 그룹 헤더: 접기/펼치기(기본 펼침) + 동아리 단위 일괄 선택. 행: selectable 만 체크 가능.
 */
export function SubmissionClubGroupList({ bookings, selection, onToggleSelect, onToggleMany, onShowDetail }: Props) {
  const [collapsedClubIds, setCollapsedClubIds] = useState<ReadonlySet<number>>(new Set());
  const groups = buildClubGroups(bookings);

  const toggleCollapsed = (clubId: number) =>
    setCollapsedClubIds((previous) => {
      const next = new Set(previous);
      if (next.has(clubId)) next.delete(clubId);
      else next.add(clubId);
      return next;
    });

  return (
    <ul className="space-y-2">
      {groups.map((group) => {
        const clubLabel = group.clubName ?? `동아리 ${group.clubId}`;
        const selectableIds = group.bookings
          .filter((booking) => booking.selectable)
          .map((booking) => booking.bookingId);
        const selectedCount = selectableIds.filter((bookingId) => selection.has(bookingId)).length;
        const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
        const expanded = !collapsedClubIds.has(group.clubId);
        return (
          <li key={group.clubId} role="group" aria-label={clubLabel} className="rounded-xl border border-line bg-paper">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`${clubLabel} 전체 선택`}
                disabled={selectableIds.length === 0}
                checked={allSelected}
                ref={(element) => {
                  if (element !== null) element.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={() => onToggleMany(selectableIds, !allSelected)}
              />
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleCollapsed(group.clubId)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <span aria-hidden className="text-xs text-charcoal-3">{expanded ? '▼' : '▶'}</span>
                <span className="font-medium text-ink-deep">{clubLabel}</span>
                <span className="text-xs text-charcoal-3">
                  {group.bookings.length}건{selectedCount > 0 ? ` · 선택 ${selectedCount}` : ''}
                </span>
              </button>
            </div>
            {expanded && (
              <ul className="border-t border-line/60">
                {group.bookings.map((booking) => {
                  const visual = submissionBlockVisual(booking);
                  return (
                    <li key={booking.bookingId} className="flex flex-wrap items-center gap-2 border-b border-line/40 px-3 py-2 text-sm last:border-b-0">
                      <input
                        type="checkbox"
                        aria-label={`${clubLabel} ${booking.reservationDate} 선택`}
                        disabled={!booking.selectable}
                        checked={selection.has(booking.bookingId)}
                        onChange={() => onToggleSelect(booking.bookingId)}
                      />
                      <span className="font-mono text-xs text-charcoal">{formatDateWithWeekday(booking.reservationDate)}</span>
                      <span className="font-mono text-xs text-charcoal">{booking.startTime}~{booking.endTime}</span>
                      <span className="max-w-40 truncate text-charcoal-2">{booking.purpose}</span>
                      <span className="tabular-nums text-xs text-charcoal-3">
                        {booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}
                      </span>
                      <span className="font-mono text-[10px] text-charcoal-3">
                        승인 {booking.decidedAt !== null ? booking.decidedAt.slice(0, 10) : '-'}
                      </span>
                      <span className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${visual.container}`}>
                        <span className={visual.nameClass}>{STATUS_LABELS[booking.status]}</span>
                      </span>
                      {booking.submitted && booking.submissionNo !== null && (
                        <span className="font-mono text-[10px] text-charcoal-3">{booking.submissionNo}</span>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowDetail(booking)}>
                        상세
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- submission-club-group-list`
Expected: PASS (8/8)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 동아리별 그룹 목록 구현"
```

---

### Task 5: Summary 카드(v2 라벨) + 페이지 조립(검색·제출 여부 필터·탭 셸) + 메뉴 추가

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionSummaryCards.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx`
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/page.tsx` (Server Component — `admin/facility-bookings/page.tsx` 사이드 파일 패턴 복제)
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts` (항목 1개)
- Test: `frontend/apps/web/test/admin/facility-submission/admin-submission-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 훅·타입, Task 3 `SubmissionTimetable`/`SubmissionDetailSheet`, Task 4 `SubmissionClubGroupList`/`onToggleMany`
- Produces(Task 6 소비): 페이지의 `selection`/`selectedIds`/`dialogOpen`/`handleCreateConfirm` — Task 6 이 Dialog 를 잇는다
- 필터 모델(v2): 단일 `SummaryFilter = 'ALL' | 'APPROVED' | 'NEED' | 'SUBMITTED' | 'CONFIRMED'`. 제출 여부 셀렉트는 그중 3값(전체=ALL/제출 필요=NEED/제출함=SUBMITTED)만 조작하고, 카드 4장은 전부 조작(제출 필요·제출함 카드=셀렉트와 동일 상태). 필터가 APPROVED/CONFIRMED 일 때 셀렉트 표시값은 '전체'(셀렉트는 제출 여부 축만 표현)

- [ ] **Step 1: 실패하는 페이지 테스트 작성**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidatesResponse } from '@duing/types';

const mockCandidatesQuery = vi.fn();
const mockUsageQuery = vi.fn();
const mockCreateMutation = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@duing/hooks', () => ({
  useSubmissionCandidatesQuery: (...args: unknown[]) => mockCandidatesQuery(...args),
  useFacilityUsageQuery: () => mockUsageQuery(),
  useCreateSubmissionBatchMutation: () => mockCreateMutation(),
}));
vi.mock('../../../app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { AdminSubmissionPage } from '../../../app/admin/facility-bookings/submission/_pages/AdminSubmissionPage';

function makeResponse(): SubmissionCandidatesResponse {
  return {
    summary: { approvedCount: 2, awaitingCount: 1, submittedCount: 1, confirmedCount: 1 },
    bookings: [
      {
        bookingId: 1, clubId: 10, clubName: '밴드부', applicantName: '홍길동', contactPhone: '010-1234-5678',
        reservationDate: '2026-08-01', startTime: '18:00', endTime: '21:00', purpose: '정기 합주',
        attendeeCount: 30, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
      {
        bookingId: 2, clubId: 11, clubName: '방송국', applicantName: '김철수', contactPhone: null,
        reservationDate: '2026-08-02', startTime: '09:00', endTime: '10:00', purpose: '연습',
        attendeeCount: null, status: 'CONFIRMED', submitted: true, selectable: false,
        submissionNo: 'SUB-20260801-001', decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
    ],
  };
}

const querySuccess = (response: SubmissionCandidatesResponse) => ({
  data: response, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn(),
});
const queryIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };

describe('AdminSubmissionPage', () => {
  beforeEach(() => {
    mockCandidatesQuery.mockReset();
    mockUsageQuery.mockReset();
    mockCreateMutation.mockReset();
    mockAddToast.mockReset();
    mockUsageQuery.mockReturnValue({ data: { facilities: [{ id: 100, roomName: '커뮤니티룸(1)' }] } });
    mockCandidatesQuery.mockReturnValue(queryIdle);
    mockCreateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  function selectFacility() {
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
  }

  it('시설을 선택하기 전에는 안내가 보이고 후보 쿼리는 null 파라미터로 비활성이다', () => {
    render(<AdminSubmissionPage />);

    expect(screen.getByText(/시설을 선택/)).toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('시설 선택 시 기간(기본 이번 달)과 함께 조회하고 v2 라벨의 Summary 4카드를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);

    selectFacility();

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0] as { facilityId: number; startDate: string };
    expect(lastParams.facilityId).toBe(100);
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
    expect(screen.getByText('승인 완료')).toBeInTheDocument();
    expect(screen.getByText('제출 필요')).toBeInTheDocument();
    expect(screen.getByText('제출함')).toBeInTheDocument();
    expect(screen.getByText('학교 등록 완료')).toBeInTheDocument();
  });

  it('기본 뷰는 동아리 그룹 목록이고 시간표는 토글로 전환된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    // 기본 = 그룹 목록(그룹 헤더 존재)
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '시간표' }));
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
  });

  it('동아리명 부분 검색이 그룹 목록을 좁힌다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });

    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();
  });

  it('제출 여부 셀렉트(제출 필요/제출함)와 카드 클릭이 같은 필터를 조작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    fireEvent.change(screen.getByLabelText('제출 여부'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();

    // 제출함 카드 재클릭 = 전체 복귀
    fireEvent.click(screen.getByRole('button', { name: /제출함/ }));
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });

  it('기간이 31일을 넘으면 조회하지 않고 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);
    selectFacility();
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/31일/);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('제출 이력 탭은 준비 중 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);

    fireEvent.click(screen.getByRole('tab', { name: '제출 이력' }));
    expect(screen.getByText(/준비 중/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: FAIL

- [ ] **Step 3: SubmissionSummaryCards 구현 (v2 라벨)**

```tsx
'use client';

import type { SubmissionSummaryCounts } from '@duing/types';

export type SummaryFilter = 'ALL' | 'APPROVED' | 'NEED' | 'SUBMITTED' | 'CONFIRMED';

type Props = {
  counts: SubmissionSummaryCounts;
  activeFilter: SummaryFilter;
  onSelectFilter: (filter: SummaryFilter) => void;
};

/** Summary 4카드(스펙 v2 §7.1) — 운영자가 월간 현황을 숫자로 먼저 파악. 클릭=필터 토글(재클릭 시 전체). */
export function SubmissionSummaryCards({ counts, activeFilter, onSelectFilter }: Props) {
  const cards: { filter: Exclude<SummaryFilter, 'ALL'>; label: string; value: number; sub: string }[] = [
    { filter: 'APPROVED', label: '승인 완료', value: counts.approvedCount, sub: '제출 여부 무관 APPROVED' },
    { filter: 'NEED', label: '제출 필요', value: counts.awaitingCount, sub: '승인 완료 · Batch 미포함' },
    { filter: 'SUBMITTED', label: '제출함', value: counts.submittedCount, sub: '활성 Batch 포함' },
    { filter: 'CONFIRMED', label: '학교 등록 완료', value: counts.confirmedCount, sub: '학교 시스템 등록됨' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.filter}>
          <button
            type="button"
            aria-pressed={activeFilter === card.filter}
            onClick={() => onSelectFilter(activeFilter === card.filter ? 'ALL' : card.filter)}
            className={`w-full rounded-xl border p-4 text-left motion-safe:transition-colors ${
              activeFilter === card.filter ? 'border-ink bg-ink/5' : 'border-line bg-paper hover:border-sage'
            }`}
          >
            <p className="text-sm text-charcoal-3">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-deep">{card.value}</p>
            <p className="mt-0.5 text-xs text-charcoal-3">{card.sub}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: AdminSubmissionPage 조립**

```tsx
'use client';

import { useState } from 'react';
import {
  useCreateSubmissionBatchMutation,
  useFacilityUsageQuery,
  useSubmissionCandidatesQuery,
} from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { SubmissionClubGroupList } from '../_components/SubmissionClubGroupList';
import { SubmissionDetailSheet } from '../_components/SubmissionDetailSheet';
import { SubmissionSummaryCards, type SummaryFilter } from '../_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../_components/SubmissionTimetable';

const MAX_PERIOD_DAYS = 31;

type SubmissionTab = 'submit' | 'history';
type ViewMode = 'list' | 'timetable';
type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 기본 조회 기간 = 이번 달 1일~말일(≤31일이라 항상 유효) — 월간 제출 업무 단위(스펙 v2). */
function currentMonthRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function periodDayCount(startDate: string, endDate: string): number {
  const diffMs = new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime();
  return Math.round(diffMs / 86_400_000) + 1;
}

function matchesFilter(booking: SubmissionCandidateBooking, filter: SummaryFilter): boolean {
  if (filter === 'APPROVED') return booking.status === 'APPROVED';
  if (filter === 'NEED') return booking.selectable;
  if (filter === 'SUBMITTED') return booking.submitted;
  if (filter === 'CONFIRMED') return booking.status === 'CONFIRMED';
  return true;
}

export function AdminSubmissionPage() {
  const defaultRange = currentMonthRange();
  const [activeTab, setActiveTab] = useState<SubmissionTab>('submit');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [clubKeyword, setClubKeyword] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('ALL');
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { addToast } = useToast();
  const usageQuery = useFacilityUsageQuery();
  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const facilityName =
    (usageQuery.data?.facilities ?? []).find((facility) => facility.id === facilityId)?.roomName ?? '';

  const periodInvalid = endDate < startDate || periodDayCount(startDate, endDate) > MAX_PERIOD_DAYS;
  const candidatesParams: SubmissionCandidatesParams | null =
    facilityId !== undefined && !periodInvalid ? { facilityId, startDate, endDate } : null;
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);
  const createMutation = useCreateSubmissionBatchMutation();

  const allBookings = candidatesQuery.data?.bookings ?? [];
  const keyword = clubKeyword.trim();
  // 동아리명 부분 검색·제출 여부 필터는 클라이언트 가공(스펙 v2 — 단일 시설·31일 상한 소량).
  const searchedBookings =
    keyword === '' ? allBookings : allBookings.filter((booking) => (booking.clubName ?? '').includes(keyword));
  const visibleBookings = searchedBookings.filter((booking) => matchesFilter(booking, summaryFilter));
  const selectableIdSet = new Set(
    visibleBookings.filter((booking) => booking.selectable).map((booking) => booking.bookingId),
  );
  const selectedIds = [...selection].filter((bookingId) => selectableIdSet.has(bookingId));

  // 제출 여부 셀렉트는 필터의 3값(전체/제출 필요/제출함)만 표현 — 카드 확장값(APPROVED/CONFIRMED)일 땐 '전체' 표시.
  const statusFilterValue: SubmissionStatusFilter =
    summaryFilter === 'NEED' || summaryFilter === 'SUBMITTED' ? summaryFilter : 'ALL';

  const resetSelection = () => setSelection(new Set());
  const toggleSelect = (bookingId: number) =>
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  const toggleMany = (bookingIds: number[], nextSelected: boolean) =>
    setSelection((previous) => {
      const next = new Set(previous);
      for (const bookingId of bookingIds) {
        if (nextSelected) next.add(bookingId);
        else next.delete(bookingId);
      }
      return next;
    });

  const handleCreateConfirm = async (memo: string) => {
    if (selectedIds.length === 0) return;
    try {
      await createMutation.mutateAsync({
        bookingIds: selectedIds,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setDialogOpen(false);
      resetSelection();
      // v2: CSV 자동 다운로드 없음 — 토스트만. 다운로드는 Batch 상세(PR-4)에서 선택 수행.
      addToast('학교 제출 Batch가 생성되었습니다.');
    } catch (error) {
      addToast(submissionErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">학교 제출</h1>
        <p className="mt-1 text-sm text-charcoal-3">승인 완료된 예약을 월간 단위로 취합해 학교 제출 대상을 관리합니다. 학교 제출 자체는 담당자가 직접 수행해요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="학교 제출 탭">
        {([['submit', '제출 대기'], ['history', '제출 이력']] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <p className="text-sm text-charcoal-3">제출 이력은 준비 중이에요. 곧 이 탭에서 확인할 수 있어요.</p>
      )}

      {activeTab === 'submit' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="시설 선택"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={facilityIdInput}
              onChange={(event) => { setFacilityIdInput(event.target.value); resetSelection(); }}
            >
              <option value="">시설을 선택하세요</option>
              {(usageQuery.data?.facilities ?? []).map((facility) => (
                <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
              ))}
            </select>
            <input
              type="date" aria-label="시작일" value={startDate}
              onChange={(event) => { setStartDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <input
              type="date" aria-label="종료일" value={endDate}
              onChange={(event) => { setEndDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <input
              type="search" aria-label="동아리 검색" value={clubKeyword} placeholder="동아리 검색"
              onChange={(event) => setClubKeyword(event.target.value)}
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
            />
            <select
              aria-label="제출 여부"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={statusFilterValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSummaryFilter(nextValue === 'NEED' || nextValue === 'SUBMITTED' ? nextValue : 'ALL');
              }}
            >
              <option value="ALL">전체</option>
              <option value="NEED">제출 필요</option>
              <option value="SUBMITTED">제출함</option>
            </select>
            <div className="ml-auto flex items-center gap-2" role="tablist" aria-label="보기 전환">
              {([['list', '목록'], ['timetable', '시간표']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs motion-safe:transition-colors ${
                    view === mode ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {facilityId === undefined && (
            <p className="py-10 text-center text-sm text-charcoal-3">학교 제출은 시설 단위로 진행돼요. 먼저 시설을 선택해주세요.</p>
          )}
          {facilityId !== undefined && periodInvalid && (
            <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
              조회 기간은 시작일부터 최대 31일까지, 역순 없이 선택할 수 있어요.
            </div>
          )}

          {candidatesParams !== null && (
            <>
              {candidatesQuery.data && (
                <SubmissionSummaryCards
                  counts={candidatesQuery.data.summary}
                  activeFilter={summaryFilter}
                  onSelectFilter={setSummaryFilter}
                />
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    toggleMany([...selectableIdSet], !(selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size))
                  }
                >
                  {selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={selectedIds.length === 0}
                  onClick={() => setDialogOpen(true)}
                >
                  선택 {selectedIds.length}건 · 제출 Batch 생성
                </button>
              </div>

              {candidatesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="제출 대상 불러오는 중" />}
              {!candidatesQuery.isLoading && candidatesQuery.isError && (
                <div role="alert" className="text-sm text-charcoal-2">
                  <p>제출 대상을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
                  <button type="button" className="btn btn-ghost mt-2" onClick={() => void candidatesQuery.refetch()}>
                    다시 시도
                  </button>
                </div>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length === 0 && (
                <p className="text-sm text-charcoal-3">
                  {summaryFilter !== 'ALL' || keyword !== ''
                    ? '필터 조건에 맞는 예약이 없어요.'
                    : '이 기간에 표시할 예약이 없어요.'}
                </p>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length > 0 && (
                view === 'list' ? (
                  <SubmissionClubGroupList
                    bookings={visibleBookings}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onToggleMany={toggleMany}
                    onShowDetail={setDetailBooking}
                  />
                ) : (
                  <SubmissionTimetable
                    bookings={visibleBookings}
                    facilityName={facilityName}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onShowDetail={setDetailBooking}
                  />
                )
              )}
            </>
          )}

          <SubmissionDetailSheet booking={detailBooking} facilityName={facilityName} onClose={() => setDetailBooking(null)} />
          {/* Task 6: BatchCreateDialog 를 여기(dialogOpen)와 handleCreateConfirm 에 연결한다. */}
        </>
      )}
    </section>
  );
}

/** 서버 메시지 우선 표출 — AdminUsersPage.forceLogoutErrorMessage 의 추출 방식을 열어 동일하게 맞춘다. */
function submissionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '학교 제출 Batch 생성에 실패했어요. 잠시 후 다시 시도해주세요.';
}
```

주의: Task 5 시점에는 `dialogOpen`·`handleCreateConfirm` 이 미연결(주석 자리) — lint 미사용 경고가 나면 생성 버튼 `onClick` 은 유지하고 Dialog 연결만 Task 6 으로 미룬다.

`page.tsx` (사이드 파일 패턴 복제):

```tsx
import { AdminSubmissionPage } from './_pages/AdminSubmissionPage';

export default function Page() {
  return <AdminSubmissionPage />;
}
```

`adminSections.ts` — 시설 예약 관리 항목 바로 아래에 추가:

```ts
  {
    href: '/admin/facility-bookings/submission',
    title: '학교 제출',
    description: '승인 예약 월간 취합·제출 대상 관리·Batch 생성',
    group: '동아리',
  },
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: PASS (7/7)

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 학교 제출 페이지 조립 — 검색·제출 여부 필터·그룹 목록 기본"
```

---

### Task 6: Batch 생성 Dialog (v2 — 자동 다운로드 없음)

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/submission/_components/BatchCreateDialog.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_pages/AdminSubmissionPage.tsx` (Dialog 연결)
- Test: `frontend/apps/web/test/admin/facility-submission/admin-submission-page.test.tsx` (플로우 테스트 추가)

**Interfaces:**
- Consumes: Task 5 의 `dialogOpen`/`handleCreateConfirm`/`selectedIds`, Task 1 `useCreateSubmissionBatchMutation`
- Produces: `BatchCreateDialog({ open, selectedCount, pending, onClose, onConfirm })`

- [ ] **Step 1: 실패하는 플로우 테스트 추가** (기존 페이지 테스트 파일에 — `waitFor` import 추가)

```tsx
  it('선택 후 생성 확인까지 진행하면 Batch 생성·성공 토스트로 끝난다(자동 다운로드 없음)', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 7, submissionNo: 'SUB-20260801-002', csvFileName: 'facility-submission-SUB-20260801-002.csv',
    });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 선택/ }));
    fireEvent.click(screen.getByRole('button', { name: /제출 Batch 생성/ }));
    expect(screen.getByText(/총 1건의 예약을 하나의 학교 제출 Batch로 생성합니다/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '8월 1차' } });
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({ bookingIds: [1], memo: '8월 1차' });
      expect(mockAddToast).toHaveBeenCalledWith('학교 제출 Batch가 생성되었습니다.');
    });
    // v2: 생성 직후 자동 다운로드 없음 — 다운로드는 상세(PR-4)에서 선택 수행
    expect(mockAddToast).toHaveBeenCalledTimes(1);
  });

  it('생성 실패(409) 시 서버 메시지 에러 토스트를 띄운다', async () => {
    const createMutateAsync = vi.fn().mockRejectedValue(new Error('이미 제출된 예약이 포함되어 있습니다.'));
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();
    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 선택/ }));
    fireEvent.click(screen.getByRole('button', { name: /제출 Batch 생성/ }));
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 제출된 예약이 포함되어 있습니다.', { variant: 'error' });
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: 신규 2건 FAIL (Dialog 미존재)

- [ ] **Step 3: BatchCreateDialog 구현 + 페이지 연결**

`BatchCreateDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  selectedCount: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (memo: string) => void;
};

/** Batch 생성 확인(스펙 v2 §7.1) — 확인 문구 + 메모. 생성 중 버튼 라벨 유지 + 스피너. */
export function BatchCreateDialog({ open, selectedCount, pending, onClose, onConfirm }: Props) {
  const [memo, setMemo] = useState('');

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학교 제출 Batch 생성</DialogTitle>
          <DialogDescription>
            총 {selectedCount}건의 예약을 하나의 학교 제출 Batch로 생성합니다. 계속하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm text-charcoal-2">
          <span className="mb-1 block text-xs text-charcoal-3">메모</span>
          <textarea
            aria-label="메모"
            value={memo}
            maxLength={500}
            rows={3}
            placeholder="예: 8월 1차 제출 (선택)"
            onChange={(event) => setMemo(event.target.value)}
            className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <DialogFooter>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={pending || selectedCount === 0} onClick={() => onConfirm(memo)}>
            {pending && <ButtonSpinner />}
            생성
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

페이지 연결(Task 6 주석 자리를 교체 + import 추가):

```tsx
          <BatchCreateDialog
            open={dialogOpen}
            selectedCount={selectedIds.length}
            pending={createMutation.isPending}
            onClose={() => setDialogOpen(false)}
            onConfirm={(memo) => void handleCreateConfirm(memo)}
          />
```

(Dialog/Spinner 의 실제 export 명·버튼 클래스는 기존 소비처(BookingActionDialog 등)와 대조 — 다르면 그 관례가 정본.)

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- admin-submission-page`
Expected: PASS (9/9)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission frontend/apps/web/test/admin/facility-submission
git commit -m "feat(frontend): 제출 Batch 생성 다이얼로그 연결 — 토스트 완결"
```

---

### Task 7: 전체 검증 + 실브라우저 QA

**Files:** 신규 없음 (회귀 수정만)

- [ ] **Step 1: 전체 게이트 실행**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm --filter @duing/web test && pnpm --filter @duing/web build`
Expected: 4개 전부 성공 — 성공 문구 직접 확인(`| tail` 금지). build 는 로컬 prod 빌드 env 오버라이드 관례 확인(frontend/AGENTS.md).

- [ ] **Step 2: 실브라우저 QA (컨트롤러 체크포인트)**

dev 서버(:3000)에서 `/admin/facility-bookings/submission` 확인 — jsdom 사각지대:
1. 그룹 아코디언 접기/펼치기·동아리 일괄 선택·indeterminate 표시
2. 동아리 검색·제출 여부 필터·카드 클릭 연동(같은 상태 공유)
3. 시간표 토글 — hover 툴팁 위치·잘림, 날짜 열 sticky, 선택 토글 ink 반전, 모바일 가로 스크롤
4. 생성 Dialog·Sheet 오버레이(`.duing` bg-cream 함정 — 크림 띠 발생 시 bg-transparent)
5. 생성 후 토스트만 뜨고 다운로드가 일어나지 않는 것(v2 계약)

QA 종료 후 dev 서버 정리(부모→워커→포트 순 kill).

- [ ] **Step 3: 마무리 self-check**

1. 스펙 v2 §7.1 전 항목 커버(시설 게이트·기간·검색·제출 여부 필터·카드 4장 v2 라벨·그룹 목록 기본·시간표 보조·선택 모델·생성 플로우 토스트 완결·로딩/에러/Empty·반응형) — 이력·상세·완료 처리는 PR-3/4
2. `any`/`as`/인터페이스/직접 fetch/useEffect 패칭 없음
3. 커밋 메시지 규칙·attribution 없음, 절대 미래 날짜 없음(순수 픽스처 제외)

- [ ] **Step 4: 커밋 (수정 발생 시에만)**

```bash
git add -A && git commit -m "test(frontend): 학교 제출 화면 회귀 정리"
```

**완료 후:** push·PR 생성은 하지 않는다 — 컨트롤러가 최종 리뷰 뒤 사용자 지시로 진행한다.
