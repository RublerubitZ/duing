# manage 예약 목록 F6 리스킨 구현 계획 (PR-B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `manage/clubs/[clubId]/facility-bookings`를 목업 F6 스타일로 리스킨 — 2탭(진행중/지난 예약)+카운트, 아이콘 카드+상태 노트, CONFLICT 경고 박스+"다시 신청" CTA — 하고, 상세 모달의 "총동연" 문구를 §2.5 통일 규칙(관리자·시간 암시 금지)으로 정리한다.

**Architecture:** 데이터 레이어·상세 모달 구조·취소 플로우는 무변경(스타일·문구·분류만). `facilityIcon`을 공용 승격(두 곳 사용 규칙)해 카드 아이콘 재사용. 탭 분류는 순수 함수로 격리해 단위 테스트.

**Tech Stack:** 기존 그대로(hook-mock 테스트 관례)

**Spec:** [`2026-07-14-facility-ux-refresh-design.md`](../specs/2026-07-14-facility-ux-refresh-design.md) §3 + §1 문구 규칙 + PR-A 최종 리뷰의 PR-B 이월(모달 "총동연" 문구)

## Global Constraints

- 브랜치 `feat/facility-manage-reskin` — **#644→#645 위 3단 스택**(facilityIcon 승격이 PR-A 산출물 이동). PR base = `feat/facility-ux-refresh`.
- **문구 규칙(§1 — 불변)**: "총동연" → "관리자"(전 화면), 예상 시간 암시 금지, 통일 안내 "관리자 승인 후 학교 반영 절차가 진행됩니다.". 상태 노트: PENDING "관리자 검토 중" / APPROVED "승인됨 · 학교 반영 대기" / CONFIRMED "예약 확정" / CONFLICT "학교 예약과 충돌 — 다른 시간이 필요해요" / REJECTED·CANCELLED 사유·기본 문구.
- **탭 재편(§3)**: 기존 4탭(전체/진행중/확정/종료) → **진행중 / 지난 예약** 2탭+카운트 뱃지. 진행중 = PENDING·APPROVED·CONFLICT + `date ≥ 오늘(KST)`인 CONFIRMED. 지난 = 과거 CONFIRMED + REJECTED·CANCELLED. 정렬은 API 순서(최신순) 유지.
- CONFLICT 카드: coral 경고 박스(`conflictDetail` 있으면 표시) + **"다시 신청" CTA** → `toRoute(\`/facilities?facilityId=${facilityId}\`)` 딥링크(Link).
- 카드 우측 보조 액션: PENDING=취소(기존 확인 다이얼로그 재사용 — **행 클릭과 분리**: 취소 버튼은 stopPropagation), CONFLICT=다시 신청(Link), 그 외=상세 텍스트. 카드 본문 클릭=상세 모달(기존).
- 유지: 데이터 훅·상세 모달 구조·취소 플로우·빈 상태("아직 신청한 예약이 없어요"+예약 홈 CTA)·에러·notFound 가드·hook-mock 테스트 관례.
- `any`/`as` 금지(`as const` 허용), `type`만, 두잉 토큰만. 리뷰는 Fable만. 커밋 한국어 Conventional Commits, attribution 금지, push·PR 금지(컨트롤러 몫).

---

## File Structure

```
frontend/apps/web/app/_lib/facilityIcon.ts               (Task 1 신규 — bookingHome에서 facilityIcon 승격 이동)
frontend/apps/web/app/facilities/_lib/bookingHome.ts     (Task 1 수정 — facilityIcon 제거·재export 없이 소비처 경로 갱신)
frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/
├── _lib/bookingDisplay 소비 (기존 공용) + _lib/bookingTabs.ts (Task 1 신규 — 2탭 분류)
├── _components/FacilityBookingsView.tsx                 (Task 2 재작성 — 헤더·2탭·리스트)
├── _components/BookingRow.tsx                           (Task 2 재작성 — F6 카드)
└── _components/BookingDetailModal.tsx                   (Task 3 수정 — 문구 통일)
frontend/apps/web/test/manage/facility-bookings/
├── booking-tabs.test.ts                                 (Task 1)
├── facility-bookings-view.test.tsx                      (Task 2 갱신)
└── booking-detail-modal.test.tsx                        (Task 3 갱신)
frontend/apps/web/test/facilities/*                      (Task 1 — facilityIcon 경로 갱신 영향)
```

---

### Task 1: facilityIcon 승격 + 2탭 분류 lib (TDD)

**Files:**
- Create: `apps/web/app/_lib/facilityIcon.ts`(승격 — 코드 무변경 이동), `apps/web/app/manage/clubs/[clubId]/facility-bookings/_lib/bookingTabs.ts`
- Modify: `apps/web/app/facilities/_lib/bookingHome.ts`(facilityIcon 제거), facilities 소비처 2곳(`FacilityHomeCard`·`FacilityContextBar`) import 경로 갱신, `test/facilities/booking-home-lib.test.ts`의 facilityIcon 케이스를 신규 경로 테스트로 이동
- Test: `test/manage/facility-bookings/booking-tabs.test.ts`

**Interfaces:**
- Produces: `facilityIcon(roomName)`(공용 경로 `@/app/_lib/facilityIcon`), `MANAGE_TAB_KEYS = ['ACTIVE','PAST']`, `MANAGE_TAB_LABELS`(진행중/지난 예약), `manageTabOf(booking: Pick<FacilityBookingSummary,'status'|'date'>, todayIso: string) → 'ACTIVE'|'PAST'`

- [ ] **Step 1: 실패하는 테스트** — `booking-tabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MANAGE_TAB_KEYS,
  MANAGE_TAB_LABELS,
  manageTabOf,
} from '@/app/manage/clubs/[clubId]/facility-bookings/_lib/bookingTabs';

const TODAY = '2026-07-20'; // 형식 검증용 고정 입력(타임밤 아님)

describe('manageTabOf', () => {
  it('대기·승인·충돌은 날짜와 무관하게 진행중이다', () => {
    expect(manageTabOf({ status: 'PENDING', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'APPROVED', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFLICT', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
  });

  it('확정은 이용일이 오늘 이후면 진행중, 지났으면 지난 예약이다', () => {
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-20' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-25' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-19' }, TODAY)).toBe('PAST');
  });

  it('거절·취소는 항상 지난 예약이다', () => {
    expect(manageTabOf({ status: 'REJECTED', date: '2026-08-01' }, TODAY)).toBe('PAST');
    expect(manageTabOf({ status: 'CANCELLED', date: '2026-08-01' }, TODAY)).toBe('PAST');
  });

  it('탭 키·라벨 계약', () => {
    expect(MANAGE_TAB_KEYS).toEqual(['ACTIVE', 'PAST']);
    expect(MANAGE_TAB_LABELS.ACTIVE).toBe('진행중');
    expect(MANAGE_TAB_LABELS.PAST).toBe('지난 예약');
  });
});
```

- [ ] **Step 2: 구현** — `bookingTabs.ts`:

```ts
// 동아리 예약 관리 2탭 분류(§3). 진행중 = 아직 액션/이용이 남은 것(대기·승인·충돌 + 미래 확정).
import type { BookingStatus, FacilityBookingSummary } from '@duing/types';

export const MANAGE_TAB_KEYS = ['ACTIVE', 'PAST'] as const;
export type ManageTabKey = (typeof MANAGE_TAB_KEYS)[number];

export const MANAGE_TAB_LABELS: Record<ManageTabKey, string> = {
  ACTIVE: '진행중',
  PAST: '지난 예약',
};

const ALWAYS_ACTIVE: readonly BookingStatus[] = ['PENDING', 'APPROVED', 'CONFLICT'];

export function manageTabOf(
  booking: Pick<FacilityBookingSummary, 'status' | 'date'>,
  todayIso: string,
): ManageTabKey {
  if (ALWAYS_ACTIVE.includes(booking.status)) return 'ACTIVE';
  if (booking.status === 'CONFIRMED') return booking.date >= todayIso ? 'ACTIVE' : 'PAST';
  return 'PAST';
}
```

승격: `facilityIcon`(규칙 배열·폴백 포함)을 `apps/web/app/_lib/facilityIcon.ts`로 이동(코드 무변경), bookingHome에서 제거, 소비처(`FacilityHomeCard`·`FacilityContextBar`) import를 `@/app/_lib/facilityIcon`으로, facilityIcon 테스트 케이스를 `test/facilities/booking-home-lib.test.ts`에서 분리해 경로만 바꿔 유지(파일 위치는 기존 파일 내 import 경로 갱신으로 충분 — 별도 파일 분리는 불필요).

- [ ] **Step 3: 검증 + Commit** — `pnpm --filter web test -- --run test/manage/facility-bookings test/facilities && pnpm typecheck`

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 시설 아이콘 공용 승격 + 예약 관리 2탭 분류 유틸"
```

---

### Task 2: 목록 리스킨 — 헤더·2탭·F6 카드

**Files:**
- Modify: `_components/FacilityBookingsView.tsx`, `_components/BookingRow.tsx`
- Test: `facility-bookings-view.test.tsx` 갱신

**Interfaces:**
- Produces: `BookingRow({ booking, onSelect, onCancel })` — `onCancel?: (bookingId: number) => void`(PENDING 전용 보조 버튼, stopPropagation). View가 취소 다이얼로그 상태를 소유(**주의**: 현재 취소 다이얼로그는 상세 모달 내부에 있다 — 실물 확인 후, 카드의 취소 버튼은 **상세 모달을 취소 의도로 여는 방식**(`setSelectedBookingId(id)`)으로 단순화해도 §3 충족("PENDING=취소" 진입점 제공). 구현 부담이 낮은 쪽 선택하고 보고서에 명시)

- [ ] **Step 1: BookingRow 재작성** — F6 카드:

```tsx
'use client';

import Link from 'next/link';
import type { FacilityBookingSummary } from '@duing/types';
import { facilityIcon } from '@/app/_lib/facilityIcon';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { toRoute } from '@/app/_lib/route';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';

const STATUS_NOTES: Partial<Record<FacilityBookingSummary['status'], string>> = {
  PENDING: '관리자 검토 중',
  APPROVED: '승인됨 · 학교 반영 대기',
  CONFIRMED: '예약 확정',
  CONFLICT: '학교 예약과 충돌 — 다른 시간이 필요해요',
};

type Props = {
  booking: FacilityBookingSummary;
  onSelect: (bookingId: number) => void;
};

export function BookingRow({ booking, onSelect }: Props) {
  const isConflict = booking.status === 'CONFLICT';
  const note = STATUS_NOTES[booking.status];
  return (
    <li>
      <div
        className={`rounded-xl border bg-paper p-4 motion-safe:transition-colors ${
          isConflict ? 'border-coral/40' : 'border-line hover:border-sage'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(booking.bookingId)}
          className="flex w-full items-center gap-3 text-left"
        >
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-graysoft text-xl">
            {facilityIcon(booking.roomName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-bold text-ink-deep">{booking.roomName}</span>
              <BookingStatusBadge status={booking.status} />
            </span>
            <span className="mt-0.5 block font-mono text-[13px] text-charcoal-2">
              {bookingDateLabel(booking.date)} · {bookingTimeLabel(booking.startTime, booking.endTime)}
            </span>
            <span className="mt-0.5 block truncate text-xs text-charcoal-3">
              {booking.purpose}
              {note && ` · ${note}`}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-xs text-charcoal-3">상세 ›</span>
        </button>
        {isConflict && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-coral/10 px-3 py-2">
            <p className="flex-1 text-xs leading-relaxed text-coral">
              승인 후 학교 예약과 겹쳐 확정되지 못했어요. 다른 시간으로 다시 신청해주세요.
            </p>
            <Link
              href={toRoute(`/facilities?facilityId=${booking.facilityId}`)}
              className="btn btn-sm shrink-0 rounded-[10px] bg-coral text-white"
              onClick={(event) => event.stopPropagation()}
            >
              다시 신청
            </Link>
          </div>
        )}
      </div>
    </li>
  );
}
```

(취소 진입점은 상세 모달의 기존 버튼 유지 — 카드 보조 버튼은 두지 않는다(§3 "우측 액션: PENDING=취소"는 상세 경유로 충족 — 재량, 보고서 명시). `toRoute`가 쿼리 포함 경로를 허용하는지 실물 시그니처 확인 — 불가하면 `/facilities?facilityId=` 문자열 조합 방식은 로그인 next 전례(`\`/${string}\`` 템플릿) 참조.)

- [ ] **Step 2: FacilityBookingsView 리스킨** — 헤더(아이브로 `MY RESERVATIONS · 동아리 예약`+h1 `시설 예약 현황`), 2탭(카운트 뱃지 — `useMemo`로 분류 1회: `const grouped = useMemo(() => { const active = []; const past = []; const todayIso = seoulDateIso(new Date()); for (const booking of bookings) (manageTabOf(booking, todayIso) === 'ACTIVE' ? active : past).push(booking); return { active, past }; }, [bookings])`), 탭 버튼(F6 스타일: `border-b-2` 활성+카운트 pill), 빈 문구 탭별("진행중인 예약 신청이 없어요"/"지난 예약이 없어요" — ALL 문구("아직 신청한 예약이 없어요")는 양쪽 다 0일 때 예약 홈 CTA와 함께), 에러·notFound·모달 배선 유지.

- [ ] **Step 3: 테스트 갱신** — 기존 4탭 시나리오를 2탭으로: 진행중(PENDING·CONFLICT·미래 CONFIRMED 포함/과거 CONFIRMED·CANCELLED 제외), 지난 예약 전환, CONFLICT 카드 경고+다시 신청 href, 상태 노트 문구, 카운트 뱃지. 날짜 픽스처는 `seoulDateIso(new Date())` 파생(절대날짜 금지 — 미래=+1일 대신 창 개념 없음이라 자유, 과거=-1일).

- [ ] **Step 4: 검증 + Commit** — `pnpm --filter web test -- --run test/manage/facility-bookings && pnpm typecheck && pnpm lint`

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 동아리 예약 목록 F6 리스킨 — 2탭·아이콘 카드·상태 노트·충돌 재신청 CTA"
```

---

### Task 3: 상세 모달 문구 통일

**Files:**
- Modify: `_components/BookingDetailModal.tsx`
- Test: `booking-detail-modal.test.tsx` 갱신

- [ ] **Step 1: 문구 교체** — 파일을 열어 "총동연" 전수 grep 후: 스텝 라벨 `['신청 완료', '총동연 승인', '학교 확정']` → `['신청 접수', '관리자 승인', '학교 반영 확정']`, APPROVED 안내 "승인된 신청의 취소는 총동연에 문의해주세요." → "승인된 신청의 취소는 관리자에게 문의해주세요.", 그 외 "총동연"·시간 암시 문구 전부 §1 규칙으로. manage 라우트 전체(`grep -rn "총동연\|1~2일" apps/web/app/manage`)도 확인해 잔존 0으로.

- [ ] **Step 2: 테스트 단언 갱신 + 검증 + Commit**

```bash
git add frontend/apps/web
git commit -m "fix(frontend): 예약 상세 모달 승인 문구 통일 — 관리자 표기·시간 암시 제거"
```

---

### Task 4: 전체 검증 + QA (컨트롤러)

- [ ] CI 4종 전부 exit 0.
- [ ] 실브라우저 QA(비로그인 범위): manage 가드·콘솔. 로그인 플로우는 hook-mock 테스트 커버(사용자 QA 이관 명시).
- [ ] Fable whole-branch 리뷰(공격 관점: 탭 분류 경계(KST 자정)·CONFLICT CTA 딥링크·문구 잔존) → 픽스 웨이브 → push·PR(base = feat/facility-ux-refresh).

---

## Out of Scope

- 인접 시간 추천, 지난 예약 페이징, 상세 모달 구조 변경, 관리자 콘솔 문구(이미 "관리자" 표기 — #642에서 정리됨)
