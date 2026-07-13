# 시설 대관 FE 2차(PR4: 동아리 예약 관리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진이 자기 동아리의 시설 예약 신청을 조회(목록+상태 탭+상세 모달)하고 PENDING 신청을 취소할 수 있는 `manage/clubs/[clubId]/facility-bookings` 페이지를 만들고, 예약 홈·성공 화면에 진입점을 연결한다.

**Architecture:** 데이터는 기존 3층(types → client → hooks)에 booking 목록/상세/취소를 추가. 페이지는 manage 관례(URL 파라미터 clubId, ManageShell 가드) 그대로 — page.tsx는 얇은 래퍼, 로직은 `FacilityBookingsView`(테스트 대상). 상세는 행 클릭 시 모달(열릴 때 상세 페치), 취소는 중앙 확인 Dialog(DESIGN.md 파괴 확인 규칙).

**Tech Stack:** Next.js 15 App Router / TanStack Query / ky(@duing/api) / vitest(hook-mock — manage 테스트 관례, msw 아님) / Tailwind(두잉 토큰)

**Spec:** [`2026-07-13-facility-booking-design.md`](../specs/2026-07-13-facility-booking-design.md) §9.6(내 예약)·§9.8(빈/에러 UX)·§4.3/§5.4/§16 결정 10(PENDING만 취소)·§8 API #3(목록)·#4(상세)·#5(취소)

## Global Constraints

- 브랜치 `feat/facility-booking-fe-manage` — **`feat/facility-booking-fe-home`에서 분기(스택 PR — PR3 #639 미머지 상태, PR base도 동일 브랜치)**. PR3 산출물(예약 훅·BookingSuccess·facilities 페이지)을 소비·수정한다.
- FE 규칙: `any`/`as` 단언 금지(테스트 `as const`·`route.ts`의 격리 헬퍼 제외), 타입 `type`만, 서버 상태 TanStack Query만, ky 직접 호출 금지, `useEffect` 데이터 패칭 금지.
- **백엔드 계약(실코드 대조 완료)**: 목록 `GET clubs/{clubId}/facility-bookings?status=`(미페이징·최신순·status 단일 필터), 상세 `GET .../{bookingId}`(history 포함), 취소 `POST .../{bookingId}/cancel`(**요청 바디 없음**, 204). 취소는 **PENDING만** — 비PENDING은 409(`현재 상태(...)에서는 CANCELLED 로 변경할 수 없습니다.`), 타 동아리/부재는 404. **취소 사유 입력 UI는 만들지 않는다**(사유는 관리자 취소 전용).
- 상세 응답의 `attendeeCount`/`rejectReason`/`conflictDetail`은 NON_NULL 직렬화(생략 가능 → optional), `history[].previousStatus`/`reason`은 항상 존재하되 null 가능.
- 상태 배지 색(§9.6 확정): PENDING=warm 계열, APPROVED=ink 옅은 톤+"학교 반영 대기" 서브라벨, CONFIRMED=ink(다크), REJECTED/CANCELLED=charcoal-3/graysoft, CONFLICT=coral.
- 취소 확인 = **중앙 Dialog**(DESIGN.md 파괴 확인 행 1): 파괴 버튼 `bg-coral text-white`(`btn-danger` 클래스 없음 — `LeaveClubDialog` 전례), 진행 중 닫힘 가드(`if (!next && !isPending) onClose()`), Esc/스크림으로 파괴 실행 금지(명시 버튼만).
- manage 테스트 관례 = **`vi.mock('@duing/hooks')` hook-mock**(bill-list.test 패턴 — msw·실 QueryClient 미사용), `ApiError`는 `vi.hoisted` mock. facilities 쪽 수정분(칩·성공 링크)만 기존 msw 스위트를 따른다.
- 날짜: `new Date('yyyy-MM-dd')` 문자열 파싱 금지 — 수동 파싱. 테스트 픽스처 하드코딩 절대날짜 금지(형식 검증용 고정 입력 제외 — 렌더가 "오늘"에 의존하지 않는 데이터라 목록/상세 픽스처의 date는 임의 고정값 허용, 만료 개념 없음).
- gen:api 재생성 **불필요** — PR3에서 이미 세 엔드포인트가 schema.d.ts에 반영됨.
- 명령은 `frontend/`에서. 커밋 한국어 Conventional Commits, Co-Authored-By/🤖 금지, push·PR 금지(컨트롤러 몫).
- **계획 재량 결정 2건(PR 본문에 명기)**: ① 목록 탭은 클라이언트 필터(미페이징이므로 status 파라미터 대신 전체 1회 조회) — 탭: 전체/진행 중(PENDING·APPROVED·CONFLICT)/확정(CONFIRMED)/종료(REJECTED·CANCELLED). ② 예약 홈 "내 신청 N건 진행 중" 칩은 운영 동아리 1개면 그 동아리 카운트+직링크, 복수면 카운트 없이 "내 예약 관리" 링크(`/manage`)만.

---

## File Structure

```
frontend/packages/types/src/facility.ts                        (Task 1 수정 — BookingStatus union·목록/상세 타입)
frontend/packages/api/src/client.ts                            (Task 1 수정 — list/get/cancel)
frontend/packages/hooks/src/facilities.ts                      (Task 1 수정 — 훅 3종)
frontend/packages/hooks/src/facilityQueryKeys.ts               (Task 1 수정 — clubBookings 키)
frontend/packages/hooks/src/index.ts                           (Task 1 수정 — re-export)

frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/
├── page.tsx                                                   (Task 3 신규 — 얇은 래퍼)
├── _lib/bookingDisplay.ts                                     (Task 2 신규 — 라벨·배지 메타·탭 분류)
└── _components/
    ├── FacilityBookingsView.tsx                               (Task 3 신규 — 목록+탭 조립)
    ├── BookingStatusBadge.tsx                                 (Task 2 신규)
    ├── BookingRow.tsx                                         (Task 3 신규)
    ├── BookingDetailModal.tsx                                 (Task 4 신규 — 상세+이력+취소 진입)
    └── CancelBookingDialog.tsx                                (Task 4 신규 — 파괴 확인)

frontend/apps/web/app/manage/_components/ManageNav.tsx         (Task 5 수정 — 링크 추가)
frontend/apps/web/app/facilities/_components/booking/
├── BookingSuccess.tsx                                         (Task 5 수정 — manage 링크)
├── BookingForm.tsx / BookingPanel.tsx                         (Task 5 수정 — onSubmitted에 clubId 전달)
└── MyBookingsChip.tsx                                         (Task 5 신규 — 예약 홈 진행 중 칩)
frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx (Task 5 수정 — 칩 배선)

frontend/apps/web/test/manage/facility-bookings/
├── booking-display.test.ts                                    (Task 2)
├── facility-bookings-view.test.tsx                            (Task 3)
└── booking-detail-modal.test.tsx                              (Task 4)
frontend/apps/web/test/facilities/facility-booking-page.test.tsx (Task 5 수정 — 칩 핸들러·시나리오)
frontend/apps/web/test/facilities/booking-components.test.tsx    (Task 5 수정 — 성공 링크 단언)
```

---

### Task 1: 데이터 레이어 — 타입·클라이언트·훅

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`, `frontend/packages/api/src/client.ts`, `frontend/packages/hooks/src/facilities.ts`, `frontend/packages/hooks/src/facilityQueryKeys.ts`, `frontend/packages/hooks/src/index.ts`

**Interfaces:**
- Produces: `BookingStatus`(union)·`FacilityBookingSummary`·`FacilityBookingHistoryItem`·`FacilityBookingDetail` 타입, `client.facilityBookings.list/get/cancel`, `useClubFacilityBookingsQuery`/`useFacilityBookingDetailQuery`/`useCancelFacilityBookingMutation`, `facilityQueryKeys.clubBookingsAll/clubBookings/clubBookingDetail`

- [ ] **Step 1: 타입 추가** — `packages/types/src/facility.ts`의 기존 예약 타입 아래에:

```ts
// 대관 신청 상태(백엔드 BookingStatus 1:1). CONFIRMED/REJECTED/CANCELLED 는 터미널.
export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CONFLICT'
  | 'CANCELLED';

// GET /clubs/{clubId}/facility-bookings — 미페이징 최신순 배열(§8 #3)
export type FacilityBookingSummary = {
  bookingId: number;
  facilityId: number;
  roomName: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: BookingStatus;
  purpose: string;
  createdAt: string; // ISO LocalDateTime
};

export type FacilityBookingHistoryItem = {
  previousStatus: BookingStatus | null; // 생성 전이는 null
  newStatus: BookingStatus;
  reason: string | null;
  changedAt: string; // ISO LocalDateTime
};

// GET /clubs/{clubId}/facility-bookings/{bookingId} — 이력(최신순) 포함(§8 #4)
export type FacilityBookingDetail = {
  bookingId: number;
  facilityId: number;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount?: number; // NON_NULL 직렬화 — null 이면 필드 생략
  rejectReason?: string;
  conflictDetail?: string;
  history: FacilityBookingHistoryItem[];
};
```

기존 `CreateFacilityBookingResult.status: 'PENDING'`은 그대로 둔다(리터럴이 더 정확).

- [ ] **Step 2: 클라이언트 추가** — `packages/api/src/client.ts`의 `facilityBookings` 선언부·구현부 확장(import에 신규 타입 추가):

선언부:

```ts
facilityBookings: {
  // POST /api/v1/clubs/{clubId}/facility-bookings — 운영진 전용(쿠키 세션). 409=슬롯 불가/중복/상한.
  create(clubId: number, payload: CreateFacilityBookingPayload): Promise<CreateFacilityBookingResult>;
  // GET /api/v1/clubs/{clubId}/facility-bookings?status= — 운영진 전용, P1 미페이징(최신순)
  list(clubId: number, status?: BookingStatus): Promise<FacilityBookingSummary[]>;
  // GET /api/v1/clubs/{clubId}/facility-bookings/{bookingId} — 상태 이력(최신순) 포함
  get(clubId: number, bookingId: number): Promise<FacilityBookingDetail>;
  // POST /api/v1/clubs/{clubId}/facility-bookings/{bookingId}/cancel — PENDING 전용, 바디 없음(204)
  cancel(clubId: number, bookingId: number): Promise<void>;
};
```

구현부(`create` 아래에):

```ts
list: (clubId, status) =>
  jsonOk<FacilityBookingSummary[]>(
    http.get(`clubs/${clubId}/facility-bookings`, {
      searchParams: status ? { status } : undefined,
    }),
  ),
get: (clubId, bookingId) =>
  jsonOk<FacilityBookingDetail>(http.get(`clubs/${clubId}/facility-bookings/${bookingId}`)),
cancel: (clubId, bookingId) =>
  jsonVoid(http.post(`clubs/${clubId}/facility-bookings/${bookingId}/cancel`)),
```

- [ ] **Step 3: 쿼리 키·훅 추가**

`facilityQueryKeys.ts`에 추가:

```ts
clubBookingsAll: (clubId: number) =>
  [...facilityQueryKeys.all, 'club-bookings', clubId] as const,
clubBookings: (clubId: number, status?: BookingStatus) =>
  [...facilityQueryKeys.clubBookingsAll(clubId), status ?? 'all'] as const,
clubBookingDetail: (clubId: number, bookingId: number) =>
  [...facilityQueryKeys.clubBookingsAll(clubId), 'detail', bookingId] as const,
```

(파일 상단에 `import type { BookingStatus } from '@duing/types';` 필요.)

`facilities.ts`에 추가:

```ts
export function useClubFacilityBookingsQuery(clubId: number | undefined, status?: BookingStatus) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined
        ? facilityQueryKeys.clubBookings(clubId, status)
        : ([...facilityQueryKeys.all, 'club-bookings', 'none'] as const),
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.facilityBookings.list(clubId, status);
    },
    enabled: clubId !== undefined,
  });
}

export function useFacilityBookingDetailQuery(clubId: number | undefined, bookingId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      clubId !== undefined && bookingId !== null
        ? facilityQueryKeys.clubBookingDetail(clubId, bookingId)
        : ([...facilityQueryKeys.all, 'club-bookings', 'detail-none'] as const),
    queryFn: () => {
      if (clubId === undefined || bookingId === null) throw new Error('clubId and bookingId are required');
      return client.facilityBookings.get(clubId, bookingId);
    },
    enabled: clubId !== undefined && bookingId !== null,
  });
}

export function useCancelFacilityBookingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { clubId: number; bookingId: number }) =>
      client.facilityBookings.cancel(input.clubId, input.bookingId),
    onSuccess: (_, input) => {
      // 취소로 목록·상세가 바뀌고, PENDING_HOLD 해제로 가용성 슬롯도 변한다.
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.clubBookingsAll(input.clubId) });
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
    },
  });
}
```

`index.ts`에 훅 3종 re-export 추가.

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck && pnpm lint`
Expected: 통과

```bash
git add frontend/packages
git commit -m "feat(frontend): 동아리 예약 목록·상세·취소 데이터 레이어 추가"
```

---

### Task 2: 표시 유틸·상태 배지 (TDD)

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/_lib/bookingDisplay.ts`, `_components/BookingStatusBadge.tsx`
- Test: `frontend/apps/web/test/manage/facility-bookings/booking-display.test.ts`

**Interfaces:**
- Produces: `bookingDateLabel(dateIso) → 'M월 D일 (요일)'`, `bookingTimeLabel(start, end) → 'HH:mm~HH:mm'`, `bookingDateTimeLabel(iso) → 'M월 D일 (요일) HH:mm'`, `BOOKING_STATUS_META: Record<BookingStatus, {...}>`, `BOOKING_TAB_*`, `bookingTabOf(status)`, `BookingStatusBadge({ status })`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@duing/types';
import {
  BOOKING_STATUS_META,
  BOOKING_TAB_KEYS,
  bookingDateLabel,
  bookingDateTimeLabel,
  bookingTabOf,
  bookingTimeLabel,
} from '@/app/manage/clubs/[clubId]/facility-bookings/_lib/bookingDisplay';

describe('bookingDateLabel', () => {
  it('로컬 파싱으로 M월 D일 (요일) 을 만든다', () => {
    expect(bookingDateLabel('2026-07-20')).toBe('7월 20일 (월)'); // 형식 검증용 고정 입력 — 만료 개념 없음
    expect(bookingDateLabel('2026-07-05')).toBe('7월 5일 (일)');
  });
});

describe('bookingTimeLabel / bookingDateTimeLabel', () => {
  it('시간 범위와 일시 라벨을 만든다', () => {
    expect(bookingTimeLabel('18:00', '20:00')).toBe('18:00~20:00');
    expect(bookingDateTimeLabel('2026-07-20T19:30:00')).toBe('7월 20일 (월) 19:30');
  });
});

describe('상태 메타·탭 분류', () => {
  it('6개 상태 전부에 라벨·클래스가 있고 APPROVED 만 서브라벨을 가진다', () => {
    const statuses: BookingStatus[] = ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CONFLICT', 'CANCELLED'];
    for (const status of statuses) {
      expect(BOOKING_STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(BOOKING_STATUS_META[status].badgeClass.length).toBeGreaterThan(0);
    }
    expect(BOOKING_STATUS_META.APPROVED.subLabel).toBe('학교 반영 대기');
    expect(BOOKING_STATUS_META.PENDING.subLabel).toBeUndefined();
  });

  it('탭 분류: 진행 중=PENDING·APPROVED·CONFLICT, 확정=CONFIRMED, 종료=REJECTED·CANCELLED', () => {
    expect(BOOKING_TAB_KEYS).toEqual(['ALL', 'ACTIVE', 'CONFIRMED', 'CLOSED']);
    expect(bookingTabOf('PENDING')).toBe('ACTIVE');
    expect(bookingTabOf('APPROVED')).toBe('ACTIVE');
    expect(bookingTabOf('CONFLICT')).toBe('ACTIVE');
    expect(bookingTabOf('CONFIRMED')).toBe('CONFIRMED');
    expect(bookingTabOf('REJECTED')).toBe('CLOSED');
    expect(bookingTabOf('CANCELLED')).toBe('CLOSED');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/manage/facility-bookings/booking-display.test.ts`
Expected: 실패(모듈 없음)

- [ ] **Step 3: 구현**

`_lib/bookingDisplay.ts`:

```ts
// 동아리 예약 관리 화면 전용 표기 유틸. 날짜는 로컬 필드 파싱만 사용한다(UTC 함정).
import type { BookingStatus } from '@duing/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function bookingDateLabel(dateIso: string): string {
  const [, month, day] = dateIso.split('-').map(Number);
  const weekday = WEEKDAY_LABELS[parseIsoDate(dateIso).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

export function bookingTimeLabel(startTime: string, endTime: string): string {
  return `${startTime}~${endTime}`;
}

export function bookingDateTimeLabel(dateTimeIso: string): string {
  return `${bookingDateLabel(dateTimeIso.slice(0, 10))} ${dateTimeIso.slice(11, 16)}`;
}

export type BookingStatusMeta = {
  label: string;
  subLabel?: string; // APPROVED 전용 — "학교 반영 대기"(§9.6)
  badgeClass: string; // 두잉 토큰 배지 클래스(§9.6 색 지정)
};

export const BOOKING_STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  PENDING: { label: '승인 대기', badgeClass: 'bg-[#FBEFD7] text-[#8E6620]' }, // warm 페어(지원 배지 전례)
  APPROVED: { label: '승인됨', subLabel: '학교 반영 대기', badgeClass: 'bg-ink/10 text-ink' },
  CONFIRMED: { label: '확정', badgeClass: 'bg-ink text-cream' },
  REJECTED: { label: '거절됨', badgeClass: 'bg-graysoft text-charcoal-3' },
  CONFLICT: { label: '학교 일정 충돌', badgeClass: 'bg-coral/15 text-coral' },
  CANCELLED: { label: '취소됨', badgeClass: 'bg-graysoft text-charcoal-3' },
};

export const BOOKING_TAB_KEYS = ['ALL', 'ACTIVE', 'CONFIRMED', 'CLOSED'] as const;
export type BookingTabKey = (typeof BOOKING_TAB_KEYS)[number];

export const BOOKING_TAB_LABELS: Record<BookingTabKey, string> = {
  ALL: '전체',
  ACTIVE: '진행 중',
  CONFIRMED: '확정',
  CLOSED: '종료',
};

export function bookingTabOf(status: BookingStatus): Exclude<BookingTabKey, 'ALL'> {
  if (status === 'PENDING' || status === 'APPROVED' || status === 'CONFLICT') return 'ACTIVE';
  if (status === 'CONFIRMED') return 'CONFIRMED';
  return 'CLOSED';
}
```

`_components/BookingStatusBadge.tsx`:

```tsx
import type { BookingStatus } from '@duing/types';
import { BOOKING_STATUS_META } from '../_lib/bookingDisplay';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta = BOOKING_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badgeClass}`}>
        {meta.label}
      </span>
      {meta.subLabel && <span className="text-[11px] text-charcoal-3">{meta.subLabel}</span>}
    </span>
  );
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/manage/facility-bookings/booking-display.test.ts`
Expected: PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 상태 배지·표기 유틸 — §9.6 색 지정·탭 분류"
```

---

### Task 3: 목록 페이지 — 탭·행 카드·빈/로딩/에러

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/page.tsx`, `_components/FacilityBookingsView.tsx`, `_components/BookingRow.tsx`
- Test: `frontend/apps/web/test/manage/facility-bookings/facility-bookings-view.test.tsx`

**Interfaces:**
- Consumes: Task 1 `useClubFacilityBookingsQuery`, Task 2 유틸·배지
- Produces: `FacilityBookingsView({ clubId: number })`(테스트 대상), `BookingRow({ booking, onSelect })`. 상세 모달은 Task 4 — 이 태스크에서는 `onSelect`가 `selectedBookingId` state만 세팅하고 모달 자리는 Task 4에서 채운다(이 태스크 시점엔 미렌더).

- [ ] **Step 1: page.tsx(얇은 래퍼)**

```tsx
'use client';

import { use } from 'react';
import { FacilityBookingsView } from './_components/FacilityBookingsView';

export default function FacilityBookingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  return <FacilityBookingsView clubId={Number.isInteger(clubId) && clubId > 0 ? clubId : Number.NaN} />;
}
```

- [ ] **Step 2: BookingRow**

```tsx
'use client';

import type { FacilityBookingSummary } from '@duing/types';
import { bookingDateLabel, bookingTimeLabel } from '../_lib/bookingDisplay';
import { BookingStatusBadge } from './BookingStatusBadge';

type Props = {
  booking: FacilityBookingSummary;
  onSelect: (bookingId: number) => void;
};

export function BookingRow({ booking, onSelect }: Props) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(booking.bookingId)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 text-left motion-safe:transition-colors hover:border-sage"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-deep">
            {booking.roomName} · {bookingDateLabel(booking.date)} {bookingTimeLabel(booking.startTime, booking.endTime)}
          </p>
          <p className="mt-0.5 truncate text-xs text-charcoal-3">{booking.purpose}</p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </button>
    </li>
  );
}
```

- [ ] **Step 3: FacilityBookingsView** — 전체 1회 조회 + 클라이언트 탭 필터(재량 결정 ①):

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useClubFacilityBookingsQuery } from '@duing/hooks';
import {
  BOOKING_TAB_KEYS,
  BOOKING_TAB_LABELS,
  bookingTabOf,
  type BookingTabKey,
} from '../_lib/bookingDisplay';
import { BookingRow } from './BookingRow';
import { BookingDetailModal } from './BookingDetailModal';

const EMPTY_MESSAGES: Record<BookingTabKey, string> = {
  ALL: '아직 신청한 예약이 없어요.',
  ACTIVE: '진행 중인 예약 신청이 없어요.',
  CONFIRMED: '확정된 예약이 없어요.',
  CLOSED: '종료된 예약 신청이 없어요.',
};

export function FacilityBookingsView({ clubId }: { clubId: number }) {
  const [activeTab, setActiveTab] = useState<BookingTabKey>('ALL');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const bookingsQuery = useClubFacilityBookingsQuery(Number.isNaN(clubId) ? undefined : clubId);

  const bookings = bookingsQuery.data ?? [];
  const displayedBookings = useMemo(
    () => (activeTab === 'ALL' ? bookings : bookings.filter((booking) => bookingTabOf(booking.status) === activeTab)),
    [bookings, activeTab],
  );

  return (
    <section>
      <h1 className="font-display text-xl text-ink-deep">시설 예약</h1>
      <p className="mt-1 text-sm text-charcoal-3">동아리 이름으로 신청한 시설 대관 내역이에요.</p>

      <div className="mt-4 flex gap-1 border-b border-line" role="tablist" aria-label="예약 상태 필터">
        {BOOKING_TAB_KEYS.map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-3 py-2 text-sm motion-safe:transition-colors ${
              activeTab === tabKey
                ? 'border-b-2 border-ink font-medium text-ink-deep'
                : 'text-charcoal-3 hover:text-charcoal'
            }`}
          >
            {BOOKING_TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {bookingsQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
        {bookingsQuery.isError && (
          <div role="alert" className="text-sm text-charcoal-2">
            <p>예약 내역을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
            <button
              type="button"
              className="btn btn-ghost mt-2"
              onClick={() => void bookingsQuery.refetch()}
            >
              다시 시도
            </button>
          </div>
        )}
        {bookingsQuery.isSuccess && displayedBookings.length === 0 && (
          <p className="text-sm text-charcoal-3">{EMPTY_MESSAGES[activeTab]}</p>
        )}
        {displayedBookings.length > 0 && (
          <ul className="space-y-2">
            {displayedBookings.map((booking) => (
              <BookingRow key={booking.bookingId} booking={booking} onSelect={setSelectedBookingId} />
            ))}
          </ul>
        )}
      </div>

      {selectedBookingId !== null && (
        <BookingDetailModal
          clubId={clubId}
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </section>
  );
}
```

(Task 3 시점에는 `BookingDetailModal`이 없어 컴파일이 깨지므로, **이 태스크에서는 모달 렌더 블록과 import를 주석 없이 뺀 버전으로 커밋**하고 Task 4에서 배선한다 — `selectedBookingId` state·`onSelect`는 지금 넣는다.)

- [ ] **Step 4: 테스트(hook-mock 패턴)** — `facility-bookings-view.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityBookingSummary } from '@duing/types';

const mockBookingsQuery = vi.hoisted(() => ({
  current: {
    data: undefined as FacilityBookingSummary[] | undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
}));

vi.mock('@duing/hooks', () => ({
  useClubFacilityBookingsQuery: () => mockBookingsQuery.current,
  useFacilityBookingDetailQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useCancelFacilityBookingMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FacilityBookingsView } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/FacilityBookingsView';

function makeBooking(overrides: Partial<FacilityBookingSummary>): FacilityBookingSummary {
  return {
    bookingId: 1,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: '2026-07-20',
    startTime: '18:00',
    endTime: '20:00',
    status: 'PENDING',
    purpose: '정기 합주',
    createdAt: '2026-07-13T19:30:00',
    ...overrides,
  };
}

beforeEach(() => {
  mockBookingsQuery.current = {
    data: undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
});

describe('FacilityBookingsView', () => {
  it('행에 시설·일시·상태 배지·목적을 표시한다', () => {
    mockBookingsQuery.current.data = [makeBooking({})];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText(/커뮤니티룸\(1\) · 7월 20일 \(월\) 18:00~20:00/)).toBeInTheDocument();
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('정기 합주')).toBeInTheDocument();
  });

  it('탭이 상태 그룹으로 필터한다 — 진행 중 탭엔 CONFLICT 포함, 종료 탭엔 CANCELLED', () => {
    mockBookingsQuery.current.data = [
      makeBooking({ bookingId: 1, status: 'CONFLICT', purpose: '충돌건' }),
      makeBooking({ bookingId: 2, status: 'CANCELLED', purpose: '취소건' }),
      makeBooking({ bookingId: 3, status: 'CONFIRMED', purpose: '확정건' }),
    ];
    render(<FacilityBookingsView clubId={7} />);
    fireEvent.click(screen.getByRole('tab', { name: '진행 중' }));
    expect(screen.getByText('충돌건')).toBeInTheDocument();
    expect(screen.queryByText('취소건')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '종료' }));
    expect(screen.getByText('취소건')).toBeInTheDocument();
    expect(screen.queryByText('확정건')).not.toBeInTheDocument();
  });

  it('빈 상태·에러 상태를 표시한다', () => {
    mockBookingsQuery.current.data = [];
    const { unmount } = render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText('아직 신청한 예약이 없어요.')).toBeInTheDocument();
    unmount();

    mockBookingsQuery.current = {
      data: undefined, isLoading: false, isError: true, isSuccess: false, refetch: vi.fn(),
    };
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByRole('alert')).toHaveTextContent('예약 내역을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockBookingsQuery.current.refetch).toHaveBeenCalled();
  });
});
```

(Task 4에서 모달이 배선되면 mock에 이미 넣어둔 detail/cancel 훅 스텁이 그대로 쓰인다.)

- [ ] **Step 5: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/manage/facility-bookings && pnpm typecheck`
Expected: PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 동아리 예약 목록 페이지 — 상태 탭·행 카드·빈/에러 상태"
```

---

### Task 4: 상세 모달 + 취소 플로우

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/_components/BookingDetailModal.tsx`, `_components/CancelBookingDialog.tsx`
- Modify: `_components/FacilityBookingsView.tsx`(모달 배선 — Task 3 Step 3의 렌더 블록·import 복원)
- Test: `frontend/apps/web/test/manage/facility-bookings/booking-detail-modal.test.tsx`

**Interfaces:**
- Consumes: Task 1 `useFacilityBookingDetailQuery`/`useCancelFacilityBookingMutation`, Task 2 유틸·배지, `Dialog`(components/ui/dialog), `useToast`, `ApiError`(@duing/api)
- Produces: `BookingDetailModal({ clubId, bookingId, onClose })`, `CancelBookingDialog({ open, isPending, errorMessage, onConfirm, onClose })`

- [ ] **Step 1: BookingDetailModal 구현** — 스텝퍼(정상 경로 3단계) + 터미널/충돌 안내 + 정보 + 이력 + PENDING 취소:

```tsx
'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import { useCancelFacilityBookingMutation, useFacilityBookingDetailQuery } from '@duing/hooks';
import type { BookingStatus } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  BOOKING_STATUS_META,
  bookingDateLabel,
  bookingDateTimeLabel,
  bookingTimeLabel,
} from '../_lib/bookingDisplay';
import { BookingStatusBadge } from './BookingStatusBadge';
import { CancelBookingDialog } from './CancelBookingDialog';

const STEPS = ['신청 완료', '총동연 승인', '학교 확정'] as const;

// 정상 경로 진행 단계 — 터미널 이탈 상태(REJECTED/CANCELLED/CONFLICT)는 스텝퍼 대신 안내 박스.
function stepIndexOf(status: BookingStatus): number | null {
  if (status === 'PENDING') return 0;
  if (status === 'APPROVED') return 1;
  if (status === 'CONFIRMED') return 2;
  return null;
}

type Props = {
  clubId: number;
  bookingId: number;
  onClose: () => void;
};

export function BookingDetailModal({ clubId, bookingId, onClose }: Props) {
  const detailQuery = useFacilityBookingDetailQuery(clubId, bookingId);
  const cancelMutation = useCancelFacilityBookingMutation();
  const { addToast } = useToast();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null);

  const detail = detailQuery.data;
  const stepIndex = detail ? stepIndexOf(detail.status) : null;

  const confirmCancel = () => {
    setCancelErrorMessage(null);
    cancelMutation.mutate(
      { clubId, bookingId },
      {
        onSuccess: () => {
          addToast('예약 신청을 취소했어요.');
          setCancelConfirmOpen(false);
          onClose();
        },
        onError: (error) => {
          setCancelErrorMessage(
            error instanceof ApiError ? error.message : '취소에 실패했어요. 잠시 후 다시 시도해주세요.',
          );
        },
      },
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="duing bg-card w-[calc(100%-2rem)] max-w-md" aria-describedby={undefined}>
          <DialogTitle className="font-display text-base text-ink-deep">예약 신청 상세</DialogTitle>

          {detailQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
          {detailQuery.isError && (
            <p role="alert" className="text-sm text-charcoal-2">상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          )}

          {detail && (
            <div className="space-y-4">
              {stepIndex !== null ? (
                <ol className="grid grid-cols-3 gap-1" aria-label="예약 진행 단계">
                  {STEPS.map((label, index) => (
                    <li key={label} className="flex flex-col items-center gap-1 text-center">
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 rounded-full ${index <= stepIndex ? 'bg-ink' : 'bg-graysoft'}`}
                      />
                      <span className={`text-[11px] ${index <= stepIndex ? 'font-medium text-ink-deep' : 'text-charcoal-3'}`}>
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={`rounded-md px-3 py-2 text-sm ${BOOKING_STATUS_META[detail.status].badgeClass}`}>
                  {BOOKING_STATUS_META[detail.status].label}
                  {detail.status === 'REJECTED' && detail.rejectReason && ` — ${detail.rejectReason}`}
                  {detail.status === 'CONFLICT' && (detail.conflictDetail ?? ' — 총동연이 확인 중이에요.')}
                </div>
              )}

              <div className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
                <p className="font-medium text-ink-deep">
                  {detail.roomName} · {bookingDateLabel(detail.date)} {bookingTimeLabel(detail.startTime, detail.endTime)}
                </p>
                <p className="mt-1 text-charcoal-2">{detail.purpose}</p>
                {detail.attendeeCount !== undefined && (
                  <p className="mt-1 text-xs text-charcoal-3">사용 인원 {detail.attendeeCount}명</p>
                )}
                <p className="mt-1 text-xs text-charcoal-3">
                  상태 <BookingStatusBadge status={detail.status} />
                </p>
              </div>

              {detail.history.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-charcoal-3">이력</p>
                  <ul className="space-y-1 text-xs text-charcoal-2">
                    {detail.history.map((item, index) => (
                      <li key={`${item.changedAt}-${index}`} className="flex items-baseline justify-between gap-2">
                        <span>
                          {BOOKING_STATUS_META[item.newStatus].label}
                          {item.reason && <span className="text-charcoal-3"> — {item.reason}</span>}
                        </span>
                        <span className="shrink-0 text-charcoal-3">{bookingDateTimeLabel(item.changedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {detail.status === 'PENDING' && (
                  <button
                    type="button"
                    className="btn rounded-[10px] bg-coral text-white disabled:opacity-50"
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    신청 취소
                  </button>
                )}
                {detail.status === 'APPROVED' && (
                  <p className="self-center text-xs text-charcoal-3">승인된 신청의 취소는 총동연에 문의해주세요.</p>
                )}
                <button type="button" className="btn btn-ghost ml-auto" onClick={onClose}>닫기</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detail && (
        <CancelBookingDialog
          open={cancelConfirmOpen}
          isPending={cancelMutation.isPending}
          errorMessage={cancelErrorMessage}
          summaryLabel={`${detail.roomName} · ${bookingDateLabel(detail.date)} ${bookingTimeLabel(detail.startTime, detail.endTime)}`}
          onConfirm={confirmCancel}
          onClose={() => {
            if (!cancelMutation.isPending) setCancelConfirmOpen(false);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: CancelBookingDialog** — DESIGN.md 파괴 확인 규칙(LeaveClubDialog 전례):

```tsx
'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type Props = {
  open: boolean;
  isPending: boolean;
  errorMessage: string | null;
  summaryLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelBookingDialog({ open, isPending, errorMessage, summaryLabel, onConfirm, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isPending) onClose(); }}>
      <DialogContent className="duing bg-card w-[calc(100%-2rem)] max-w-sm" aria-describedby={undefined}>
        <DialogTitle className="font-display text-base text-ink-deep">예약 신청을 취소할까요?</DialogTitle>
        <p className="text-sm text-charcoal-2">{summaryLabel}</p>
        <p className="text-xs text-charcoal-3">취소하면 되돌릴 수 없어요. 같은 시간이 필요하면 다시 신청해야 해요.</p>
        {errorMessage && (
          <p role="alert" className="text-xs text-coral">{errorMessage}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className="btn rounded-[10px] bg-coral text-white disabled:opacity-50"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? '취소 중…' : '신청 취소'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(포털이므로 `duing` 스코프 재부여 — Dialog 는 `bg-card` 패널이라 크림 띠 함정 없음. 기존 `dialog.tsx` 의 DialogContent 기본 클래스를 열어 확인하고 중복 지정은 제거.)

- [ ] **Step 3: FacilityBookingsView 에 모달 배선** — Task 3에서 뺀 import·렌더 블록 복원(Task 3 Step 3 코드의 최종 형태 그대로).

- [ ] **Step 4: 테스트** — `booking-detail-modal.test.tsx` (bill-list 패턴 — 훅 mock + ApiError hoisted):

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityBookingDetail } from '@duing/types';

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {}
  return { MockApiError };
});

const mockDetailQuery = vi.hoisted(() => ({
  current: { data: undefined as FacilityBookingDetail | undefined, isLoading: false, isError: false },
}));
const mockCancelMutate = vi.hoisted(() => vi.fn());
const mockCancelPending = vi.hoisted(() => ({ current: false }));

vi.mock('@duing/api', () => ({ ApiError: MockApiError }));
vi.mock('@duing/hooks', () => ({
  useFacilityBookingDetailQuery: () => mockDetailQuery.current,
  useCancelFacilityBookingMutation: () => ({ mutate: mockCancelMutate, isPending: mockCancelPending.current }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { BookingDetailModal } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/BookingDetailModal';

function makeDetail(overrides: Partial<FacilityBookingDetail>): FacilityBookingDetail {
  return {
    bookingId: 31,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: '2026-07-20',
    startTime: '18:00',
    endTime: '20:00',
    status: 'PENDING',
    purpose: '정기 합주',
    history: [
      { previousStatus: null, newStatus: 'PENDING', reason: null, changedAt: '2026-07-13T19:30:00' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockDetailQuery.current = { data: undefined, isLoading: false, isError: false };
  mockCancelMutate.mockReset();
  mockCancelPending.current = false;
});

describe('BookingDetailModal', () => {
  it('PENDING 상세: 스텝퍼 1단계 활성 + 취소 버튼 + 이력', () => {
    mockDetailQuery.current.data = makeDetail({});
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.getByLabelText('예약 진행 단계')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신청 취소' })).toBeInTheDocument();
    expect(screen.getByText(/7월 13일 \(월\) 19:30/)).toBeInTheDocument();
  });

  it('취소 버튼 → 확인 다이얼로그 → 확정 시 mutate 호출', () => {
    mockDetailQuery.current.data = makeDetail({});
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    expect(screen.getByText('예약 신청을 취소할까요?')).toBeInTheDocument();
    // Radix Dialog 중첩으로 두 dialog 가 동시에 DOM 에 있다 — 확인 다이얼로그의 파괴 버튼은
    // 두 번째 '신청 취소' 버튼(인덱스 접근 + 가드, bill-list 전례. `as` 단언 금지).
    const confirmButtons = screen.getAllByRole('button', { name: '신청 취소' });
    expect(confirmButtons).toHaveLength(2);
    const destructiveButton = confirmButtons[1];
    if (!destructiveButton) throw new Error('확인 다이얼로그 버튼을 찾지 못했습니다');
    fireEvent.click(destructiveButton);
    expect(mockCancelMutate).toHaveBeenCalledWith(
      { clubId: 7, bookingId: 31 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('APPROVED: 취소 버튼 없이 총동연 문의 안내 + 서브라벨', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'APPROVED' });
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument();
    expect(screen.getByText('승인된 신청의 취소는 총동연에 문의해주세요.')).toBeInTheDocument();
  });

  it('REJECTED: 스텝퍼 대신 거절 사유 안내', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'REJECTED', rejectReason: '중복 신청' });
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('예약 진행 단계')).not.toBeInTheDocument();
    expect(screen.getByText(/거절됨 — 중복 신청/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/manage/facility-bookings && pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 상세 모달·취소 플로우 — 스텝퍼·이력·PENDING 파괴 확인"
```

---

### Task 5: 진입점 3종 — ManageNav·성공 화면 링크·예약 홈 칩

**Files:**
- Modify: `frontend/apps/web/app/manage/_components/ManageNav.tsx`, `frontend/apps/web/app/facilities/_components/booking/BookingSuccess.tsx`, `BookingForm.tsx`, `BookingPanel.tsx`, `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx`
- Create: `frontend/apps/web/app/facilities/_components/booking/MyBookingsChip.tsx`
- Test: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`(핸들러·시나리오 추가), `test/facilities/booking-components.test.tsx`(성공 링크 단언)

**Interfaces:**
- Consumes: Task 1 `useClubFacilityBookingsQuery`, 기존 `useManagedClubsQuery`·`useAuthStore`·`toRoute`
- Produces: `MyBookingsChip()`(자체 훅 호출), `BookingSuccess`에 `manageHref?: string` prop, `BookingForm.onSubmitted(result, clubId)` 시그니처 변경(파급: BookingPanel·FacilityBookingPage)

- [ ] **Step 1: ManageNav 링크** — 파일을 열어 기존 "관리" 섹션 항목 형태 그대로 `시설 예약` 항목 추가(`toRoute(\`/manage/clubs/${currentClubId}/facility-bookings\`)`), 활성 표시 로직은 기존 패턴 준수.

- [ ] **Step 2: onSubmitted 에 clubId 전달 + 성공 화면 링크**

- `BookingForm.tsx`: `onSubmitted: (result: CreateFacilityBookingResult, clubId: number) => void` 로 변경, `onSuccess: (result) => { addToast(...); onSubmitted(result, effectiveClubId); }` (effectiveClubId 는 submit 가드로 non-null 확정 — 지역 변수로 내로잉).
- `BookingPanel.tsx`: `onSubmitted` prop 시그니처 동일 변경, `submittedClubId: number | null` prop 추가, success 분기에서 `manageHref={submittedClubId !== null ? \`/manage/clubs/${submittedClubId}/facility-bookings\` : undefined}` 전달.
- `FacilityBookingPage.tsx`: `const [submittedClubId, setSubmittedClubId] = useState<number | null>(null);` — `onSubmitted={(result, clubId) => { setSubmittedResult(result); setSubmittedClubId(clubId); setStep('success'); }}`, `closePanel`에서 함께 리셋, `submittedClubId` prop 전달.
- `BookingSuccess.tsx`: `manageHref?: string` prop 추가 — 확인 버튼 위에:

```tsx
{manageHref && (
  <Link href={toRoute(manageHref)} className="btn btn-secondary w-full">
    내 예약에서 확인
  </Link>
)}
```

(`import Link from 'next/link';` + `import { toRoute } from '@/app/_lib/route';` — toRoute 시그니처를 열어 확인하고 typedRoutes 에 맞게 사용. `booking-components.test.tsx` 에 BookingSuccess 렌더 단언 1건 추가: manageHref 전달 시 `내 예약에서 확인` 링크 노출 + `href` 검증.)

- [ ] **Step 3: MyBookingsChip** — 재량 결정 ②(운영 1개=카운트+직링크 / 복수=일반 링크):

```tsx
'use client';

import Link from 'next/link';
import { useClubFacilityBookingsQuery, useManagedClubsQuery } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import { toRoute } from '@/app/_lib/route';

/** 예약 홈 상단 "내 신청 N건 진행 중" 칩(§9.6) — 로그인 운영진에게만 보인다. */
export function MyBookingsChip() {
  const authStatus = useAuthStore((state) => state.status);
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const managedClubs = managedClubsQuery.data ?? [];
  const singleClubId = managedClubs.length === 1 ? managedClubs[0]?.clubId : undefined;
  const bookingsQuery = useClubFacilityBookingsQuery(singleClubId);

  if (authStatus !== 'authenticated' || managedClubs.length === 0) return null;

  if (singleClubId !== undefined) {
    const activeCount = (bookingsQuery.data ?? []).filter(
      (booking) => booking.status === 'PENDING' || booking.status === 'APPROVED',
    ).length;
    if (activeCount === 0) return null;
    return (
      <Link
        href={toRoute(`/manage/clubs/${singleClubId}/facility-bookings`)}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-charcoal-2 hover:border-sage"
      >
        내 신청 <span className="font-bold text-ink">{activeCount}건</span> 진행 중 →
      </Link>
    );
  }

  // 운영 동아리가 여럿이면 카운트 없이 관리 홈으로(재량 결정 ② — 동아리별 집계는 P2)
  return (
    <Link
      href={toRoute('/manage')}
      className="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-charcoal-2 hover:border-sage"
    >
      내 예약 관리 →
    </Link>
  );
}
```

`FacilityBookingPage.tsx` 의 h1 아래(칩 스트립 위)에 `<MyBookingsChip />` 렌더.

- [ ] **Step 4: facilities msw 테스트 갱신** — `facility-booking-page.test.tsx`:
- **필수**: 시나리오 4·7·8(authenticated)이 이제 `*/clubs/7/facility-bookings` GET 을 유발한다(`onUnhandledRequest: 'error'` — 핸들러 없으면 전부 깨짐). 기본 핸들러에 `http.get('*/clubs/7/facility-bookings', () => ok([]))` 추가.
- 시나리오 추가 1건: authenticated + 목록 핸들러가 PENDING 1건 반환 → `내 신청 1건 진행 중` 칩 노출과 href 단언. 비로그인 시나리오에서 칩 부재 단언 1줄.

- [ ] **Step 5: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/facilities test/manage/facility-bookings && pnpm typecheck && pnpm lint`
Expected: 전건 PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 관리 진입점 — ManageNav·성공 화면 링크·예약 홈 진행 중 칩"
```

---

### Task 6: 전체 검증 + 실브라우저 QA

- [ ] **Step 1: CI 4종**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm lint; echo "lint=$?"
pnpm typecheck; echo "typecheck=$?"
NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 pnpm build; echo "build=$?"
pnpm test; echo "test=$?"
```
Expected: 전부 0

- [ ] **Step 2: 실브라우저 QA**(백엔드 bootRun + `pnpm dev` :3000 — 컨트롤러 수행): 비로그인으로 `/manage/clubs/1/facility-bookings` 진입 시 ManageGuard 동작, 예약 홈에 칩 부재(비로그인), 콘솔 에러 없음. **로그인 필요한 플로우(목록·상세·취소·칩 카운트)는 msw 테스트로 커버 — 운영진 계정 자격증명이 없어 실브라우저는 사용자 QA 항목으로 이관**(보고에 명시).
- [ ] **Step 3: 워킹트리 클린 확인** — `git status --short` clean.

---

## Out of Scope (후속)

- 관리자 승인 큐·대시보드 — PR5
- 동아리별 집계 칩(운영 동아리 복수일 때 카운트) — P2
- 목록 페이징·서버 status 필터 활용 — P2(관리자 큐와 함께)
- PR3 이연 목록(a11y 묶음·주간 뷰 §9.5 미구현 등) — 별도 후속
