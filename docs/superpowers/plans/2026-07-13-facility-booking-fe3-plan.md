# 시설 대관 FE 3차(PR5: 관리자 콘솔) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/facility-bookings` — 대시보드 카드 4장 + 승인 큐(서버 필터·페이징) + 상세 모달(크롤 신선도·검증 컨텍스트 슬롯 스트립·이력) + 액션 5종(승인/거절/수동 확정/충돌 전환/취소, 승인 409 충돌 패널 포함).

**Architecture:** 데이터는 `admin.facilityBookings` 네임스페이스(client)+`adminQueryKeys`+전용 훅 파일. 상태 배지·표기 유틸은 manage 라우트에서 **공용 승격**(두 곳 사용 규칙). 페이지는 admin 관례(서버 파라미터 필터+Pagination, hook-mock 테스트) 그대로. 승인 409는 `ApiError.code === 'FACILITY_BOOKING_SCHOOL_CONFLICT'` 분기 + `payload` 타입 가드로 충돌 상세를 모달 내 패널로 표시.

**Tech Stack:** Next.js 15 / TanStack Query / ky(@duing/api) / vitest(hook-mock) / Tailwind(두잉 토큰)

**Spec:** [`2026-07-13-facility-booking-design.md`](../specs/2026-07-13-facility-booking-design.md) §9.7(대시보드·큐·상세)·§8 #6~#13·§8.3(409 계약)·§5.2(신선도 배너)·§4.3(ADMIN 액션 매트릭스)

## Global Constraints

- 브랜치 `feat/facility-booking-fe-admin` — **`feat/facility-booking-fe-manage`에서 분기(3단 스택: #639→#640→이 PR)**. PR base도 `feat/facility-booking-fe-manage`.
- FE 규칙: `any`/`as` 금지(`as const`·route.ts 격리 헬퍼 제외 — **409 payload는 `unknown`이므로 수동 타입 가드**로 좁힌다), `type`만, 서버 상태 TanStack Query만, `useEffect` 데이터 패칭 금지.
- **백엔드 계약(실코드 대조 완료)**: 큐 `GET admin/facility-bookings?status=&facilityId=&dateFrom=&dateTo=&page=&size=` → `PageResponse<AdminFacilityBookingSummaryResponse>`(정렬은 백엔드가 status 종속 결정 — **FE는 sort 파라미터 전송 금지**), 상세 GET, 액션 5종 POST(**approve/confirm=바디 없음**, reject=`{reason}`, conflict=`{detail}`, cancel=`{reason}` — 전부 500자 상한, 204). summary GET → counts 8필드(전부 항상 존재).
- NON_NULL 생략 필드: 큐 행 `approvedWaitingDays?`, 상세 `attendeeCount?/rejectReason?/conflictDetail?/matchedScheduleSeq?/crawlBasisAt?`. 항상 존재: `conflictSuspected`/`partiallyMatched`(boolean), `stale`, `overlaps[]`, `overlappingPendingCount`, `history[]`.
- **409 두 종류 구분**: SchoolConflict = `ApiError.code === 'FACILITY_BOOKING_SCHOOL_CONFLICT'` + `payload = { conflicts: [{source:'SCHOOL', organization, start:'HH:mm', end:'HH:mm'}], crawlBasisAt: string(+09:00)|null }`. 상태 전이 위반 = 409 + `code === undefined` → `message` 그대로 토스트/인라인.
- ADMIN 액션 매트릭스(§4.3): PENDING=승인/거절, APPROVED=수동 확정/충돌 전환/취소, CONFLICT=재승인/취소, CONFIRMED·REJECTED·CANCELLED=조회만.
- 대시보드 카드(§9.7): 승인 대기=`pendingCount`(+오늘 `todaySubmittedCount`, 강조 `oldestPendingWaitingDays`), 학교 반영 대기=`approvedWaitingCount`(강조 `oldestApprovedWaitingDays` — coral), **충돌=`conflictCount + conflictSuspectedCount` 합산**(1건 이상 coral), 이달 확정=`confirmedThisMonthCount`. 카드 클릭=해당 탭 전환.
- 큐 탭(카드와 1:1): 대기(PENDING, **기본**)/반영 대기(APPROVED)/**충돌·의심**(CONFLICT 목록 + APPROVED 중 `conflictSuspected`만 병합 — 쿼리 2개)/확정(CONFIRMED)/전체. APPROVED 행 "학교 반영 대기 D+N", `conflictSuspected`/`partiallyMatched` 배지.
- admin 관례: 라우트 가드=layout의 AdminRoleGuard(추가 작업 불필요), page.tsx=얇은 래퍼→`_pages/`, 필터=서버 파라미터(`'ALL'` 센티넬→undefined), `Pagination` 컴포넌트, PAGE_SIZE=20, 테스트=hook-mock(`vi.mock('@duing/hooks')`), 다이얼로그=`Dialog`+`onPointerDownOutside/onEscapeKeyDown` 처리 중 차단(AdminPromotionRequestProcessDialog 전례), 토스트=`@/app/_components/toast/ToastProvider`.
- 상태 배지 승격: `BOOKING_STATUS_META`·`BookingStatusBadge`·날짜 유틸이 manage와 admin 두 곳 사용이 되므로 **`apps/web/app/_lib/bookingDisplay.ts` + `apps/web/app/_components/BookingStatusBadge.tsx`로 승격**하고 manage 쪽 import 경로 갱신(재작성 금지 — 파일 이동+import 수정만).
- gen:api 재생성 불필요(PR3 시점 스키마에 admin 엔드포인트 포함). 명령은 `frontend/`에서. 커밋 한국어 Conventional Commits, Co-Authored-By/🤖 금지, push·PR 금지.
- **계획 재량 결정(PR 본문 명기)**: ① 기간 필터는 date input 2개(dateFrom/dateTo, 서버 파라미터). ② 충돌·의심 탭=쿼리 2개 병합(CONFLICT 전체 + APPROVED 페이지 내 conflictSuspected — APPROVED 쪽은 현재 페이지 범위만, P1 수용). ③ 검증 컨텍스트는 13칸 미니 슬롯 스트립(신청 구간=ink 테두리, SCHOOL 점유=coral, INTERNAL=graysoft, 겹치는 PENDING=warm 점선)으로 구현. ④ adminSections group은 기존 '동아리' 그룹에 편입(새 그룹 신설 없음).

---

## File Structure

```
frontend/packages/types/src/facility.ts                        (Task 1 수정 — admin 타입 4종+충돌 payload)
frontend/packages/api/src/client.ts                            (Task 1 수정 — admin.facilityBookings 8종)
frontend/packages/hooks/src/facilityBookingsAdmin.ts           (Task 1 신규 — 훅 8종)
frontend/packages/hooks/src/adminQueryKeys.ts                  (Task 1 수정)
frontend/packages/hooks/src/index.ts                           (Task 1 수정)

frontend/apps/web/app/_lib/bookingDisplay.ts                   (Task 2 — manage에서 승격 이동)
frontend/apps/web/app/_components/BookingStatusBadge.tsx       (Task 2 — 승격 이동)
frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/ (Task 2 수정 — import 경로 갱신, _lib/_components의 구 파일 삭제)
frontend/apps/web/app/admin/facility-bookings/
├── page.tsx                                                   (Task 3 신규 — 얇은 래퍼)
├── _lib/adminBookingDisplay.ts                                (Task 2 신규 — 신선도 라벨·충돌 payload 가드·슬롯 스트립 파생)
├── _pages/AdminFacilityBookingsPage.tsx                       (Task 3 신규 — 조립)
└── _components/
    ├── BookingSummaryCards.tsx                                (Task 3 신규)
    ├── AdminBookingQueueTable.tsx                             (Task 3 신규)
    ├── AdminBookingDetailModal.tsx                            (Task 4 신규)
    ├── AdminSlotStrip.tsx                                     (Task 4 신규)
    └── BookingActionDialog.tsx                                (Task 4 신규 — 사유 입력 공용)
frontend/apps/web/app/admin/_lib/adminSections.ts              (Task 5 수정 — 메뉴 항목)

frontend/apps/web/test/admin/facility-bookings/
├── admin-booking-display.test.ts                              (Task 2)
├── admin-bookings-page.test.tsx                               (Task 3)
└── admin-booking-detail-modal.test.tsx                        (Task 4)
```

---

### Task 1: 데이터 레이어 — admin 타입·클라이언트·훅

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`, `frontend/packages/api/src/client.ts`, `frontend/packages/hooks/src/adminQueryKeys.ts`, `frontend/packages/hooks/src/index.ts`
- Create: `frontend/packages/hooks/src/facilityBookingsAdmin.ts`

**Interfaces:**
- Produces: `AdminFacilityBookingSummary`/`AdminFacilityBookingDetail`(+`AdminBookingOverlapItem`)/`AdminFacilityBookingCounts`/`FacilityBookingConflictPayload` 타입, `AdminBookingQueueParams`, `client.admin.facilityBookings.{queue,detail,approve,reject,confirm,markConflict,cancel,summary}`, 훅 `useAdminFacilityBookingQueueQuery`/`useAdminFacilityBookingDetailQuery`/`useAdminFacilityBookingSummaryQuery`/`useApprove...`/`useReject...`/`useConfirm...`/`useMarkConflict...`/`useCancelFacilityBookingAdminMutation`

- [ ] **Step 1: 타입 추가** — `packages/types/src/facility.ts` 하단(§8 #6~#13 계약 1:1, `FacilityBookingHistoryItem`·`BookingStatus` 재사용):

```ts
// ── 관리자 콘솔(§8 #6~#13) ─────────────────────────────────────────────

export type AdminFacilityBookingSummary = {
  bookingId: number;
  clubId: number;
  clubName: string;
  facilityId: number;
  roomName: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string;
  status: BookingStatus;
  purpose: string;
  createdAt: string; // ISO LocalDateTime
  approvedWaitingDays?: number; // NON_NULL — APPROVED 행에만("학교 반영 대기 D+N")
  conflictSuspected: boolean;
  partiallyMatched: boolean;
};

export type AdminBookingOverlapItem = {
  source: string; // 'SCHOOL' | 'INTERNAL' | 'PENDING' 계열 — 검증 컨텍스트 시각화용
  organization: string;
  startTime: string; // HH:mm
  endTime: string;
};

export type AdminFacilityBookingDetail = {
  bookingId: number;
  clubId: number;
  clubName: string;
  facilityId: number;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount?: number;
  rejectReason?: string;
  conflictDetail?: string;
  matchedScheduleSeq?: number;
  crawlBasisAt?: string; // ISO LocalDateTime — 재크롤 실패·미수집 시 생략
  stale: boolean;
  overlaps: AdminBookingOverlapItem[];
  overlappingPendingCount: number;
  history: FacilityBookingHistoryItem[];
};

export type AdminFacilityBookingCounts = {
  pendingCount: number;
  todaySubmittedCount: number;
  oldestPendingWaitingDays: number;
  approvedWaitingCount: number;
  oldestApprovedWaitingDays: number;
  conflictCount: number;
  conflictSuspectedCount: number;
  confirmedThisMonthCount: number;
};

// 승인 409(FACILITY_BOOKING_SCHOOL_CONFLICT)의 ApiError.payload 형태(§8.3)
export type FacilityBookingConflictPayload = {
  conflicts: { source: string; organization: string; start: string; end: string }[];
  crawlBasisAt: string | null; // OffsetDateTime(+09:00) 또는 null
};

export type AdminBookingQueueParams = {
  status?: BookingStatus;
  facilityId?: number;
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string;
  page?: number;
  size?: number;
};
```

- [ ] **Step 2: 클라이언트** — `client.ts`의 `admin` 네임스페이스에 추가(기존 admin 리소스 형태·`cleanParams` 관례 그대로, import 보충):

선언부(admin 타입 블록):

```ts
facilityBookings: {
  // GET /api/v1/admin/facility-bookings — 큐(정렬은 서버가 status 종속 결정, sort 전송 금지)
  queue(params: AdminBookingQueueParams): Promise<PageResponse<AdminFacilityBookingSummary>>;
  // GET /api/v1/admin/facility-bookings/{bookingId} — 상세+검증 컨텍스트(온디맨드 재크롤)
  detail(bookingId: number): Promise<AdminFacilityBookingDetail>;
  // POST .../approve — 바디 없음. 409+code=FACILITY_BOOKING_SCHOOL_CONFLICT 시 payload에 충돌 상세
  approve(bookingId: number): Promise<void>;
  reject(bookingId: number, reason: string): Promise<void>;
  // POST .../confirm — 수동 확정(자동 매칭 실패분), 바디 없음
  confirm(bookingId: number): Promise<void>;
  markConflict(bookingId: number, detail: string): Promise<void>;
  cancel(bookingId: number, reason: string): Promise<void>;
  // GET .../summary — 대시보드 카드 수치(§9.7)
  summary(): Promise<AdminFacilityBookingCounts>;
};
```

구현부(admin 구현 블록):

```ts
facilityBookings: {
  queue: (params) =>
    jsonOk<PageResponse<AdminFacilityBookingSummary>>(
      http.get('admin/facility-bookings', { searchParams: cleanParams(params) }),
    ),
  detail: (bookingId) =>
    jsonOk<AdminFacilityBookingDetail>(http.get(`admin/facility-bookings/${bookingId}`)),
  approve: (bookingId) => jsonVoid(http.post(`admin/facility-bookings/${bookingId}/approve`)),
  reject: (bookingId, reason) =>
    jsonVoid(http.post(`admin/facility-bookings/${bookingId}/reject`, { json: { reason } })),
  confirm: (bookingId) => jsonVoid(http.post(`admin/facility-bookings/${bookingId}/confirm`)),
  markConflict: (bookingId, detail) =>
    jsonVoid(http.post(`admin/facility-bookings/${bookingId}/conflict`, { json: { detail } })),
  cancel: (bookingId, reason) =>
    jsonVoid(http.post(`admin/facility-bookings/${bookingId}/cancel`, { json: { reason } })),
  summary: () => jsonOk<AdminFacilityBookingCounts>(http.get('admin/facility-bookings/summary')),
},
```

- [ ] **Step 3: 쿼리 키·훅** — `adminQueryKeys.ts` 관례대로 추가:

```ts
facilityBookingsAll: ['admin', 'facility-bookings'] as const,
facilityBookingQueue: (params: AdminBookingQueueParams) =>
  [...adminQueryKeys.facilityBookingsAll, 'queue', params] as const,
facilityBookingDetail: (bookingId: number) =>
  [...adminQueryKeys.facilityBookingsAll, 'detail', bookingId] as const,
facilityBookingSummary: () => [...adminQueryKeys.facilityBookingsAll, 'summary'] as const,
```

`facilityBookingsAdmin.ts` 신규(훅 8종 — 쿼리 3·뮤테이션 5). 뮤테이션 공통 무효화: `adminQueryKeys.facilityBookingsAll`(큐·상세·summary 전부 prefix) + `facilityQueryKeys.availabilityAll()`(승인/취소가 슬롯 HOLD/차단에 영향). **onSettled**(실패 원인이 서버 측 선행 전이일 수 있음 — 생성/취소 mutation 전례):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBookingQueueParams } from '@duing/types';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { facilityQueryKeys } from './facilityQueryKeys';

export function useAdminFacilityBookingQueueQuery(
  params: AdminBookingQueueParams,
  options?: { enabled?: boolean },
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilityBookingQueue(params),
    queryFn: () => client.admin.facilityBookings.queue(params),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminFacilityBookingDetailQuery(bookingId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      bookingId !== null
        ? adminQueryKeys.facilityBookingDetail(bookingId)
        : ([...adminQueryKeys.facilityBookingsAll, 'detail-none'] as const),
    queryFn: () => {
      if (bookingId === null) throw new Error('bookingId is required');
      return client.admin.facilityBookings.detail(bookingId);
    },
    enabled: bookingId !== null,
  });
}

export function useAdminFacilityBookingSummaryQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.facilityBookingSummary(),
    queryFn: () => client.admin.facilityBookings.summary(),
  });
}

function useAdminBookingInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    // 액션은 큐·상세·summary 를 모두 바꾸고, 승인/취소는 예약 홈 가용성(HOLD/차단)에도 반영된다.
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilityBookingsAll });
    void queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
  };
}

export function useApproveFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number }) => client.admin.facilityBookings.approve(input.bookingId),
    onSettled: invalidate,
  });
}

export function useRejectFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; reason: string }) =>
      client.admin.facilityBookings.reject(input.bookingId, input.reason),
    onSettled: invalidate,
  });
}

export function useConfirmFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number }) => client.admin.facilityBookings.confirm(input.bookingId),
    onSettled: invalidate,
  });
}

export function useMarkConflictFacilityBookingMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; detail: string }) =>
      client.admin.facilityBookings.markConflict(input.bookingId, input.detail),
    onSettled: invalidate,
  });
}

export function useCancelFacilityBookingAdminMutation() {
  const client = useApiClient();
  const invalidate = useAdminBookingInvalidation();
  return useMutation({
    mutationFn: (input: { bookingId: number; reason: string }) =>
      client.admin.facilityBookings.cancel(input.bookingId, input.reason),
    onSettled: invalidate,
  });
}
```

`index.ts`에 훅 8종 re-export.

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck && pnpm lint`
Expected: 통과

```bash
git add frontend/packages
git commit -m "feat(frontend): 시설 예약 관리자 데이터 레이어 — 큐·상세·요약·액션 5종"
```

---

### Task 2: 배지 승격 + admin 표시 유틸 (TDD)

**Files:**
- Move: `manage/clubs/[clubId]/facility-bookings/_lib/bookingDisplay.ts` → `apps/web/app/_lib/bookingDisplay.ts`, `.../facility-bookings/_components/BookingStatusBadge.tsx` → `apps/web/app/_components/BookingStatusBadge.tsx`(내부 import 경로만 조정, 코드 무변경)
- Modify: manage 쪽 소비자들(BookingRow·FacilityBookingsView·BookingDetailModal와 테스트)의 import 경로 갱신
- Create: `frontend/apps/web/app/admin/facility-bookings/_lib/adminBookingDisplay.ts`
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-booking-display.test.ts`(+기존 manage 테스트의 import 경로 갱신 — `booking-display.test.ts`는 승격된 경로를 가리키게 수정)

**Interfaces:**
- Produces: (승격) 기존 export 전부 경로만 변경. (신규) `crawlFreshnessLabel(crawlBasisAt: string | undefined, now: Date) → string`("마지막 수집 N분 전" | "수집 정보 없음"), `isFacilityBookingConflictPayload(payload: unknown) → payload is FacilityBookingConflictPayload`(수동 타입 가드), `buildSlotStrip(detail 요약 인자) → SlotStripCell[13]`, `conflictCardCount(counts) → number`(합산)

- [ ] **Step 1: 실패하는 테스트 작성** — `admin-booking-display.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSlotStrip,
  conflictCardCount,
  crawlFreshnessLabel,
  isFacilityBookingConflictPayload,
} from '@/app/admin/facility-bookings/_lib/adminBookingDisplay';

describe('crawlFreshnessLabel', () => {
  it('기준 시각 대비 경과 분/시간을 라벨링하고, 없으면 안내 문구를 준다', () => {
    const now = new Date(2026, 6, 13, 12, 0, 0);
    expect(crawlFreshnessLabel('2026-07-13T11:45:00', now)).toBe('마지막 수집 15분 전');
    expect(crawlFreshnessLabel('2026-07-13T09:00:00', now)).toBe('마지막 수집 3시간 전');
    expect(crawlFreshnessLabel(undefined, now)).toBe('수집 정보 없음');
  });
});

describe('isFacilityBookingConflictPayload', () => {
  it('§8.3 payload 형태만 통과시킨다', () => {
    expect(
      isFacilityBookingConflictPayload({
        conflicts: [{ source: 'SCHOOL', organization: '문화팀', start: '18:00', end: '19:00' }],
        crawlBasisAt: '2026-07-13T11:20:00+09:00',
      }),
    ).toBe(true);
    expect(isFacilityBookingConflictPayload({ conflicts: [], crawlBasisAt: null })).toBe(true);
    expect(isFacilityBookingConflictPayload(null)).toBe(false);
    expect(isFacilityBookingConflictPayload({ conflicts: 'x' })).toBe(false);
    expect(isFacilityBookingConflictPayload({ conflicts: [{ organization: 1 }] })).toBe(false);
  });
});

describe('buildSlotStrip', () => {
  it('신청 구간·점유행·겹치는 항목을 13칸에 매핑한다', () => {
    const cells = buildSlotStrip({
      startTime: '18:00',
      endTime: '20:00',
      overlaps: [
        { source: 'SCHOOL', organization: '문화팀', startTime: '18:00', endTime: '19:00' },
        { source: 'PENDING', organization: '', startTime: '20:00', endTime: '21:00' },
      ],
    });
    expect(cells).toHaveLength(13);
    expect(cells[9]).toEqual({ hour: 18, inRequest: true, overlapSource: 'SCHOOL' }); // 18시 칸
    expect(cells[10]).toEqual({ hour: 19, inRequest: true, overlapSource: null });
    expect(cells[11]).toEqual({ hour: 20, inRequest: false, overlapSource: 'PENDING' });
    expect(cells[0]).toEqual({ hour: 9, inRequest: false, overlapSource: null });
  });
});

describe('conflictCardCount', () => {
  it('CONFLICT 건수와 충돌 의심 건수를 합산한다(§9.7)', () => {
    expect(
      conflictCardCount({
        pendingCount: 0, todaySubmittedCount: 0, oldestPendingWaitingDays: 0,
        approvedWaitingCount: 0, oldestApprovedWaitingDays: 0,
        conflictCount: 2, conflictSuspectedCount: 3, confirmedThisMonthCount: 0,
      }),
    ).toBe(5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/admin/facility-bookings/admin-booking-display.test.ts`
Expected: 실패(모듈 없음)

- [ ] **Step 3: 승격 이동 + 신규 구현**

승격: `git mv`로 두 파일 이동 후 manage 소비자 3파일+테스트의 import 경로를 `@/app/_lib/bookingDisplay`·`@/app/_components/BookingStatusBadge`로 갱신(코드 무변경 — BookingStatusBadge 내부의 상대 import만 `@/app/_lib/bookingDisplay`로 조정).

`adminBookingDisplay.ts`:

```ts
// 관리자 콘솔 전용 파생 — 크롤 신선도·409 payload 가드·검증 컨텍스트 슬롯 스트립(§9.7·§8.3)
import type { AdminBookingOverlapItem, AdminFacilityBookingCounts, FacilityBookingConflictPayload } from '@duing/types';

export function crawlFreshnessLabel(crawlBasisAt: string | undefined, now: Date): string {
  if (!crawlBasisAt) return '수집 정보 없음';
  const [datePart, timePart] = crawlBasisAt.split('T');
  const [year, month, day] = (datePart ?? '').split('-').map(Number);
  const [hour, minute] = (timePart ?? '').split(':').map(Number);
  const basis = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - basis.getTime()) / 60_000));
  if (elapsedMinutes < 60) return `마지막 수집 ${elapsedMinutes}분 전`;
  return `마지막 수집 ${Math.floor(elapsedMinutes / 60)}시간 전`;
}

function isConflictSlot(candidate: unknown): candidate is FacilityBookingConflictPayload['conflicts'][number] {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'source' in candidate &&
    typeof candidate.source === 'string' &&
    'organization' in candidate &&
    typeof candidate.organization === 'string' &&
    'start' in candidate &&
    typeof candidate.start === 'string' &&
    'end' in candidate &&
    typeof candidate.end === 'string'
  );
}

export function isFacilityBookingConflictPayload(payload: unknown): payload is FacilityBookingConflictPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  if (!('conflicts' in payload) || !Array.isArray(payload.conflicts)) return false;
  if (!payload.conflicts.every(isConflictSlot)) return false;
  if (!('crawlBasisAt' in payload)) return false;
  return payload.crawlBasisAt === null || typeof payload.crawlBasisAt === 'string';
}

export type SlotStripCell = { hour: number; inRequest: boolean; overlapSource: string | null };

export function buildSlotStrip(input: {
  startTime: string;
  endTime: string;
  overlaps: Pick<AdminBookingOverlapItem, 'source' | 'startTime' | 'endTime'>[];
}): SlotStripCell[] {
  const requestStart = Number(input.startTime.slice(0, 2));
  const requestEnd = Number(input.endTime.slice(0, 2));
  return Array.from({ length: 13 }, (_, index) => {
    const hour = 9 + index;
    const overlap = input.overlaps.find(
      (item) => Number(item.startTime.slice(0, 2)) <= hour && hour < Number(item.endTime.slice(0, 2)),
    );
    return {
      hour,
      inRequest: requestStart <= hour && hour < requestEnd,
      overlapSource: overlap ? overlap.source : null,
    };
  });
}

export function conflictCardCount(counts: AdminFacilityBookingCounts): number {
  return counts.conflictCount + counts.conflictSuspectedCount;
}
```

(타입 가드는 `in` 연산자 내로잉만 사용 — `as` 없음. 테스트가 계약이므로 가드 시맨틱만 유지하면 세부 표현은 조정 가능.)

- [ ] **Step 4: 통과 확인 + 회귀 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/admin/facility-bookings test/manage/facility-bookings test/facilities && pnpm typecheck`
Expected: 전건 PASS(승격 이동 반영)

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 배지·표기 유틸 공용 승격 + 관리자 표시 유틸(신선도·409 가드·슬롯 스트립)"
```

---

### Task 3: 대시보드 카드 + 승인 큐 페이지

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/page.tsx`, `_pages/AdminFacilityBookingsPage.tsx`, `_components/BookingSummaryCards.tsx`, `_components/AdminBookingQueueTable.tsx`
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 훅, Task 2 유틸·배지(승격 경로), `Pagination`(기존 컴포넌트 — 위치는 promotion-requests 페이지 import에서 확인), `useFacilityUsageQuery`(시설 셀렉트 옵션)
- Produces: `AdminFacilityBookingsPage()`, `BookingSummaryCards({ counts, activeTab, onSelectTab })`, `AdminBookingQueueTable({ rows, onSelect })`, 탭 타입 `AdminQueueTab = 'PENDING' | 'APPROVED' | 'CONFLICT_ATTENTION' | 'CONFIRMED' | 'ALL'`

- [ ] **Step 1: BookingSummaryCards** — 카드 4장(클릭=탭 전환, `aria-pressed`):

```tsx
'use client';

import type { AdminFacilityBookingCounts } from '@duing/types';
import { conflictCardCount } from '../_lib/adminBookingDisplay';

export type AdminQueueTab = 'PENDING' | 'APPROVED' | 'CONFLICT_ATTENTION' | 'CONFIRMED' | 'ALL';

type Props = {
  counts: AdminFacilityBookingCounts;
  activeTab: AdminQueueTab;
  onSelectTab: (tab: AdminQueueTab) => void;
};

export function BookingSummaryCards({ counts, activeTab, onSelectTab }: Props) {
  const conflictTotal = conflictCardCount(counts);
  const cards: { tab: AdminQueueTab; label: string; value: number; sub: string; warn: boolean }[] = [
    {
      tab: 'PENDING', label: '승인 대기', value: counts.pendingCount,
      sub: `오늘 접수 ${counts.todaySubmittedCount}건 · 최장 ${counts.oldestPendingWaitingDays}일 대기`,
      warn: false,
    },
    {
      tab: 'APPROVED', label: '학교 반영 대기', value: counts.approvedWaitingCount,
      sub: `최장 D+${counts.oldestApprovedWaitingDays}`,
      warn: counts.oldestApprovedWaitingDays >= 7,
    },
    {
      tab: 'CONFLICT_ATTENTION', label: '충돌·의심', value: conflictTotal,
      sub: `충돌 ${counts.conflictCount} · 의심 ${counts.conflictSuspectedCount}`,
      warn: conflictTotal > 0,
    },
    { tab: 'CONFIRMED', label: '이달 확정', value: counts.confirmedThisMonthCount, sub: '자동+수동 확정', warn: false },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.tab}>
          <button
            type="button"
            aria-pressed={activeTab === card.tab}
            onClick={() => onSelectTab(card.tab)}
            className={`w-full rounded-xl border p-4 text-left motion-safe:transition-colors ${
              activeTab === card.tab ? 'border-ink bg-ink/5' : 'border-line bg-paper hover:border-sage'
            }`}
          >
            <p className="text-sm text-charcoal-3">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${card.warn ? 'text-coral' : 'text-ink-deep'}`}>
              {card.value}
            </p>
            <p className={`mt-0.5 text-xs ${card.warn ? 'text-coral' : 'text-charcoal-3'}`}>{card.sub}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: AdminBookingQueueTable** — 행: 동아리·시설·일시·상태 배지·플래그 배지·경과, 클릭=상세:

```tsx
'use client';

import type { AdminFacilityBookingSummary } from '@duing/types';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';

type Props = {
  rows: AdminFacilityBookingSummary[];
  onSelect: (bookingId: number) => void;
};

export function AdminBookingQueueTable({ rows, onSelect }: Props) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.bookingId}>
          <button
            type="button"
            onClick={() => onSelect(row.bookingId)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 text-left motion-safe:transition-colors hover:border-sage"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-deep">
                {row.clubName} · {row.roomName} · {bookingDateLabel(row.date)}{' '}
                {bookingTimeLabel(row.startTime, row.endTime)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-charcoal-3">
                <span className="truncate">{row.purpose}</span>
                {row.approvedWaitingDays !== undefined && (
                  <span className={row.approvedWaitingDays >= 7 ? 'font-bold text-coral' : ''}>
                    학교 반영 대기 D+{row.approvedWaitingDays}
                  </span>
                )}
                {row.conflictSuspected && (
                  <span className="rounded-full bg-coral/15 px-2 py-0.5 font-bold text-coral">충돌 의심</span>
                )}
                {row.partiallyMatched && (
                  <span className="rounded-full bg-[#FBEFD7] px-2 py-0.5 font-bold text-[#8E6620]">부분 반영</span>
                )}
              </p>
            </div>
            <BookingStatusBadge status={row.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: 페이지 조립** — `AdminFacilityBookingsPage.tsx`(전문). 탭→서버 파라미터 매핑: PENDING/APPROVED/CONFIRMED=`status` 지정, ALL=`status` 없음, **CONFLICT_ATTENTION=쿼리 2개**(CONFLICT 큐 + APPROVED 큐를 각각 호출해 CONFLICT 전체 뒤에 APPROVED 중 `conflictSuspected`만 이어 붙임 — 페이징은 CONFLICT 쪽만, APPROVED 의심은 현재 페이지 범위 병합, 재량 결정 ②):

```tsx
'use client';

import { useState } from 'react';
import {
  useAdminFacilityBookingQueueQuery,
  useAdminFacilityBookingSummaryQuery,
  useFacilityUsageQuery,
} from '@duing/hooks';
import type { AdminBookingQueueParams } from '@duing/types';
import { Pagination } from '@/app/_components/Pagination';
import { AdminBookingQueueTable } from '../_components/AdminBookingQueueTable';
import { AdminBookingDetailModal } from '../_components/AdminBookingDetailModal';
import { BookingSummaryCards, type AdminQueueTab } from '../_components/BookingSummaryCards';

const PAGE_SIZE = 20;

const TAB_LABELS: Record<AdminQueueTab, string> = {
  PENDING: '승인 대기',
  APPROVED: '반영 대기',
  CONFLICT_ATTENTION: '충돌·의심',
  CONFIRMED: '확정',
  ALL: '전체',
};

function statusParamOf(tab: AdminQueueTab): AdminBookingQueueParams['status'] {
  if (tab === 'PENDING' || tab === 'APPROVED' || tab === 'CONFIRMED') return tab;
  if (tab === 'CONFLICT_ATTENTION') return 'CONFLICT';
  return undefined;
}

export function AdminFacilityBookingsPage() {
  const [activeTab, setActiveTab] = useState<AdminQueueTab>('PENDING');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const baseParams: AdminBookingQueueParams = {
    facilityId,
    dateFrom: dateFrom === '' ? undefined : dateFrom,
    dateTo: dateTo === '' ? undefined : dateTo,
    page,
    size: PAGE_SIZE,
  };

  const summaryQuery = useAdminFacilityBookingSummaryQuery();
  const queueQuery = useAdminFacilityBookingQueueQuery({ ...baseParams, status: statusParamOf(activeTab) });
  // 충돌·의심 탭 전용 보조 쿼리 — APPROVED 중 conflictSuspected 를 병합(재량 결정 ②)
  const suspectedQuery = useAdminFacilityBookingQueueQuery(
    { ...baseParams, status: 'APPROVED' },
    { enabled: activeTab === 'CONFLICT_ATTENTION' },
  );
  const usageQuery = useFacilityUsageQuery();

  const selectTab = (tab: AdminQueueTab) => {
    setActiveTab(tab);
    setPage(0);
  };

  const conflictRows = queueQuery.data?.content ?? [];
  const suspectedRows =
    activeTab === 'CONFLICT_ATTENTION'
      ? (suspectedQuery.data?.content ?? []).filter((row) => row.conflictSuspected)
      : [];
  const rows = activeTab === 'CONFLICT_ATTENTION' ? [...conflictRows, ...suspectedRows] : conflictRows;
  const totalPages = queueQuery.data?.totalPages ?? 0;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">시설 예약 관리</h1>
        <p className="mt-1 text-sm text-charcoal-3">대관 신청 승인·학교 반영 확인·충돌 처리를 한 곳에서 합니다.</p>
      </div>

      {summaryQuery.data && (
        <BookingSummaryCards counts={summaryQuery.data} activeTab={activeTab} onSelectTab={selectTab} />
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="큐 필터">
        {(Object.keys(TAB_LABELS) as AdminQueueTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => selectTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
        <select
          aria-label="시설 필터"
          className="ml-auto rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          value={facilityIdInput}
          onChange={(event) => { setFacilityIdInput(event.target.value); setPage(0); }}
        >
          <option value="">전체 시설</option>
          {(usageQuery.data?.facilities ?? []).map((facility) => (
            <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
          ))}
        </select>
        <input
          type="date" aria-label="시작일" value={dateFrom}
          onChange={(event) => { setDateFrom(event.target.value); setPage(0); }}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
        <input
          type="date" aria-label="종료일" value={dateTo}
          onChange={(event) => { setDateTo(event.target.value); setPage(0); }}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
      </div>

      {queueQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
      {queueQuery.isError && (
        <div role="alert" className="text-sm text-charcoal-2">
          <p>큐를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void queueQuery.refetch()}>
            다시 시도
          </button>
        </div>
      )}
      {queueQuery.isSuccess && rows.length === 0 && (
        <p className="text-sm text-charcoal-3">해당 조건의 신청이 없어요.</p>
      )}
      {rows.length > 0 && <AdminBookingQueueTable rows={rows} onSelect={setSelectedBookingId} />}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}

      {selectedBookingId !== null && (
        <AdminBookingDetailModal bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      )}
    </section>
  );
}
```

**구현 주의 2건**: ① `Pagination` import 경로는 promotion-requests 페이지에서 실제 경로를 확인해 맞춰라. ② Task 3 시점에 `AdminBookingDetailModal`이 없다 — **모달 import·렌더 블록을 뺀 버전으로 커밋**하고 Task 4에서 배선(FE4 전례).

- [ ] **Step 4: page.tsx** — `export default function Page() { return <AdminFacilityBookingsPage />; }` (admin 관례 — 가드는 layout).

- [ ] **Step 5: 테스트(hook-mock)** — `admin-bookings-page.test.tsx`: `vi.mock('@duing/hooks')`로 summary/queue/usage 훅 stub. 시나리오 4건: ① 카드 4장 수치(충돌 카드=합산 5) 렌더 ② 충돌 카드 클릭 → 탭 전환 + queue 훅이 `status:'CONFLICT'`로 호출됨(`toHaveBeenCalledWith(expect.objectContaining(...))`) ③ APPROVED 행 D+N·충돌 의심·부분 반영 배지 렌더 ④ 빈 상태·에러+다시 시도. (mock 반환 형태는 `test/admin/notices/admin-notices-list.test.tsx` 전례의 `makeListResponse` 패턴.)

- [ ] **Step 6: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add frontend/apps/web frontend/packages
git commit -m "feat(frontend): 관리자 시설 예약 콘솔 — 대시보드 카드·승인 큐·필터"
```

---

### Task 4: 상세 모달 + 액션 5종

**Files:**
- Create: `frontend/apps/web/app/admin/facility-bookings/_components/AdminBookingDetailModal.tsx`, `_components/AdminSlotStrip.tsx`, `_components/BookingActionDialog.tsx`
- Modify: `_pages/AdminFacilityBookingsPage.tsx`(모달 배선 복원)
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-booking-detail-modal.test.tsx`

**Interfaces:**
- Consumes: Task 1 상세 쿼리·뮤테이션 5종, Task 2 유틸(신선도·가드·스트립)·배지(승격 경로), `Dialog`, `useToast`, `ApiError`
- Produces: `AdminBookingDetailModal({ bookingId, onClose })`, `AdminSlotStrip({ startTime, endTime, overlaps })`, `BookingActionDialog({ open, title, description, reasonLabel, reasonRequired, isPending, errorMessage, destructive, onConfirm(reason), onClose })`(사유 입력 공용 — approve/confirm은 사유 없이 `reasonRequired: false`로 확인만)

- [ ] **Step 1: AdminSlotStrip** — 13칸 가로 스트립(§9.7 검증 컨텍스트):

```tsx
import type { AdminBookingOverlapItem } from '@duing/types';
import { buildSlotStrip } from '../_lib/adminBookingDisplay';

type Props = {
  startTime: string;
  endTime: string;
  overlaps: AdminBookingOverlapItem[];
};

function cellTone(overlapSource: string | null): string {
  if (overlapSource === 'SCHOOL') return 'bg-coral/40';
  if (overlapSource === 'INTERNAL') return 'bg-graysoft';
  if (overlapSource !== null) return 'border border-dashed border-[#8E6620] bg-[#FBEFD7]'; // 겹치는 PENDING
  return 'bg-paper';
}

export function AdminSlotStrip({ startTime, endTime, overlaps }: Props) {
  const cells = buildSlotStrip({ startTime, endTime, overlaps });
  return (
    <div aria-label="검증 컨텍스트 타임라인">
      <div className="grid grid-cols-13 gap-[2px]">
        {cells.map((cell) => (
          <div
            key={cell.hour}
            title={`${cell.hour}:00`}
            className={`h-6 rounded-[3px] ${cellTone(cell.overlapSource)} ${
              cell.inRequest ? 'ring-2 ring-inset ring-ink' : 'border border-line/60'
            }`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-charcoal-3">
        <span>09시</span><span>15시</span><span>22시</span>
      </div>
    </div>
  );
}
```

(`grid-cols-13`은 arbitrary — `grid-cols-[repeat(13,minmax(0,1fr))]`로 작성. 구현 시 Tailwind 지원 형태 확인.)

- [ ] **Step 2: BookingActionDialog** — 사유 입력 공용(전례 AdminPromotionRequestProcessDialog의 처리 중 차단 패턴):

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type Props = {
  open: boolean;
  title: string;
  description: string;
  reasonLabel: string | null; // null = 사유 입력 없는 확인만(승인·수동 확정)
  isPending: boolean;
  errorMessage: string | null;
  destructive: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

export function BookingActionDialog({
  open, title, description, reasonLabel, isPending, errorMessage, destructive, onConfirm, onClose,
}: Props) {
  const [reason, setReason] = useState('');
  const reasonInvalid = reasonLabel !== null && (reason.trim().length === 0 || reason.trim().length > 500);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)]"
        onPointerDownOutside={(event) => { if (isPending) event.preventDefault(); }}
        onEscapeKeyDown={(event) => { if (isPending) event.preventDefault(); }}
        aria-describedby={undefined}
      >
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm text-charcoal-2">{description}</p>
        {reasonLabel !== null && (
          <textarea
            aria-label={reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder={`${reasonLabel}을(를) 입력해주세요 (500자 이내)`}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
          />
        )}
        {errorMessage && <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-xs text-coral">{errorMessage}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>
            돌아가기
          </button>
          <button
            type="button"
            className={`btn btn-sm ${destructive ? 'rounded-[10px] bg-coral text-white disabled:opacity-50' : 'btn-primary'}`}
            disabled={isPending || reasonInvalid}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending ? '처리 중…' : title}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(`btn-sm`은 admin 전례에서 확인된 클래스(AdminPromotionRequestProcessDialog) — facilities와 달리 admin에서는 존재 여부를 구현 시 재확인하고 없으면 `btn` 단독으로.)

- [ ] **Step 3: AdminBookingDetailModal** — 상세+신선도 배너+스트립+이력+상태별 액션(§4.3) + 승인 409 충돌 패널:

핵심 구조(전문 — 구현 시 이 형태 유지):

```tsx
'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useAdminFacilityBookingDetailQuery,
  useApproveFacilityBookingMutation,
  useCancelFacilityBookingAdminMutation,
  useConfirmFacilityBookingMutation,
  useMarkConflictFacilityBookingMutation,
  useRejectFacilityBookingMutation,
} from '@duing/hooks';
import type { FacilityBookingConflictPayload } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';
import { bookingDateLabel, bookingDateTimeLabel, bookingTimeLabel, BOOKING_STATUS_META } from '@/app/_lib/bookingDisplay';
import { crawlFreshnessLabel, isFacilityBookingConflictPayload } from '../_lib/adminBookingDisplay';
import { AdminSlotStrip } from './AdminSlotStrip';
import { BookingActionDialog } from './BookingActionDialog';

type ActionKind = 'approve' | 'reject' | 'confirm' | 'markConflict' | 'cancel';

const ACTION_META: Record<ActionKind, { title: string; description: string; reasonLabel: string | null; destructive: boolean; successMessage: string }> = {
  approve: { title: '승인', description: '신청 시간대를 재검증한 뒤 승인합니다. 겹침이 있으면 승인되지 않아요.', reasonLabel: null, destructive: false, successMessage: '승인했어요. 학교 반영 후 자동 확정됩니다.' },
  reject: { title: '거절', description: '거절 사유는 신청 동아리에 그대로 표시됩니다.', reasonLabel: '거절 사유', destructive: true, successMessage: '거절했어요.' },
  confirm: { title: '수동 확정', description: '학교 반영을 직접 확인한 경우에만 확정하세요. 확정 후에는 되돌릴 수 없어요.', reasonLabel: null, destructive: false, successMessage: '확정했어요.' },
  markConflict: { title: '충돌 전환', description: '학교 일정과 충돌한 건으로 표시합니다. 상세는 동아리에 노출됩니다.', reasonLabel: '충돌 상세', destructive: true, successMessage: '충돌 상태로 전환했어요.' },
  cancel: { title: '취소', description: '승인된 예약을 취소합니다. 사유는 동아리에 표시됩니다.', reasonLabel: '취소 사유', destructive: true, successMessage: '취소했어요.' },
};

type Props = { bookingId: number; onClose: () => void };

export function AdminBookingDetailModal({ bookingId, onClose }: Props) {
  const detailQuery = useAdminFacilityBookingDetailQuery(bookingId);
  const approveMutation = useApproveFacilityBookingMutation();
  const rejectMutation = useRejectFacilityBookingMutation();
  const confirmMutation = useConfirmFacilityBookingMutation();
  const markConflictMutation = useMarkConflictFacilityBookingMutation();
  const cancelMutation = useCancelFacilityBookingAdminMutation();
  const { addToast } = useToast();

  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictPayload, setConflictPayload] = useState<FacilityBookingConflictPayload | null>(null);

  const detail = detailQuery.data;

  const mutationOf = (kind: ActionKind) =>
    kind === 'approve' ? approveMutation
    : kind === 'reject' ? rejectMutation
    : kind === 'confirm' ? confirmMutation
    : kind === 'markConflict' ? markConflictMutation
    : cancelMutation;

  const isActionPending =
    approveMutation.isPending || rejectMutation.isPending || confirmMutation.isPending ||
    markConflictMutation.isPending || cancelMutation.isPending;

  const runAction = (kind: ActionKind, reason: string) => {
    setActionError(null);
    setConflictPayload(null);
    const callbacks = {
      onSuccess: () => {
        addToast(ACTION_META[kind].successMessage);
        setActiveAction(null);
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'FACILITY_BOOKING_SCHOOL_CONFLICT' && isFacilityBookingConflictPayload(error.payload)) {
          setConflictPayload(error.payload);
          setActiveAction(null); // 확인 다이얼로그는 닫고 모달 본문의 충돌 패널로 안내
          return;
        }
        setActionError(error instanceof ApiError ? error.message : '처리에 실패했어요. 잠시 후 다시 시도해주세요.');
      },
    };
    if (kind === 'approve') approveMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'confirm') confirmMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'reject') rejectMutation.mutate({ bookingId, reason }, callbacks);
    else if (kind === 'markConflict') markConflictMutation.mutate({ bookingId, detail: reason }, callbacks);
    else cancelMutation.mutate({ bookingId, reason }, callbacks);
  };

  // §4.3 상태별 액션 매트릭스
  const availableActions: ActionKind[] =
    detail?.status === 'PENDING' ? ['approve', 'reject']
    : detail?.status === 'APPROVED' ? ['confirm', 'markConflict', 'cancel']
    : detail?.status === 'CONFLICT' ? ['approve', 'cancel']
    : [];

  return (
    <>
      <Dialog open onOpenChange={(next) => { if (!next && !isActionPending) onClose(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg" aria-describedby={undefined}>
          <DialogTitle>예약 신청 검토</DialogTitle>

          {detailQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
          {detailQuery.isError && (
            <p role="alert" className="text-sm text-charcoal-2">상세를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium text-ink-deep">
                  <span>{detail.clubName} · {detail.roomName}</span>
                  <BookingStatusBadge status={detail.status} />
                </p>
                <p className="mt-1 font-mono text-[13px] text-charcoal-2">
                  {bookingDateLabel(detail.date)} {bookingTimeLabel(detail.startTime, detail.endTime)}
                </p>
                <p className="mt-1 text-charcoal-2">{detail.purpose}</p>
                {detail.attendeeCount !== undefined && (
                  <p className="mt-1 text-xs text-charcoal-3">사용 인원 {detail.attendeeCount}명</p>
                )}
                {detail.rejectReason && <p className="mt-1 text-xs text-charcoal-3">거절 사유 — {detail.rejectReason}</p>}
                {detail.conflictDetail && <p className="mt-1 text-xs text-coral">충돌 상세 — {detail.conflictDetail}</p>}
              </div>

              {/* 크롤 신선도(§5.2) */}
              <div
                role={detail.stale ? 'alert' : undefined}
                className={`rounded-md px-3 py-2 text-xs ${detail.stale ? 'bg-coral/10 text-coral' : 'bg-graysoft/60 text-charcoal-3'}`}
              >
                {crawlFreshnessLabel(detail.crawlBasisAt, new Date())}
                {detail.stale && ' — 최신 크롤링을 확인하지 못했습니다. 마지막 수집 데이터를 기준으로 판단하세요.'}
              </div>

              <AdminSlotStrip startTime={detail.startTime} endTime={detail.endTime} overlaps={detail.overlaps} />
              {detail.overlappingPendingCount > 0 && (
                <p className="text-xs text-charcoal-3">같은 시간대 대기 신청 {detail.overlappingPendingCount}건 — 승인 시 자동 거절됩니다.</p>
              )}

              {/* 승인 409 충돌 패널(§8.3) */}
              {conflictPayload && (
                <div role="alert" className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
                  <p className="font-bold">학교 예약과 시간이 충돌하여 승인할 수 없습니다.</p>
                  <ul className="mt-1 space-y-0.5">
                    {conflictPayload.conflicts.map((conflict, index) => (
                      <li key={`${conflict.start}-${index}`}>
                        {conflict.organization} · {conflict.start}~{conflict.end}
                      </li>
                    ))}
                  </ul>
                  {conflictPayload.crawlBasisAt && (
                    <p className="mt-1">기준 수집 시각 {conflictPayload.crawlBasisAt.slice(0, 16).replace('T', ' ')}</p>
                  )}
                  <p className="mt-1">충돌 전환 또는 거절로 처리하세요.</p>
                </div>
              )}

              {actionError && <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-xs text-coral">{actionError}</p>}

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

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {availableActions.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`btn btn-sm ${ACTION_META[kind].destructive ? 'rounded-[10px] bg-coral text-white' : 'btn-primary'}`}
                    disabled={isActionPending}
                    onClick={() => { setActionError(null); setActiveAction(kind); }}
                  >
                    {kind === 'approve' && detail.status === 'CONFLICT' ? '재승인' : ACTION_META[kind].title}
                  </button>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {activeAction !== null && (
        <BookingActionDialog
          open
          title={ACTION_META[activeAction].title}
          description={ACTION_META[activeAction].description}
          reasonLabel={ACTION_META[activeAction].reasonLabel}
          isPending={mutationOf(activeAction).isPending}
          errorMessage={actionError}
          destructive={ACTION_META[activeAction].destructive}
          onConfirm={(reason) => runAction(activeAction, reason)}
          onClose={() => { if (!mutationOf(activeAction).isPending) setActiveAction(null); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: 페이지 배선 복원** — Task 3에서 뺀 import·렌더 블록 복원.

- [ ] **Step 5: 테스트(hook-mock)** — `admin-booking-detail-modal.test.tsx` 시나리오 5건: ① PENDING 상세 → 승인·거절 버튼만, 신선도 라벨·스트립·이력 렌더 ② APPROVED → 수동 확정·충돌 전환·취소 버튼(+D+N 정보는 큐 소관이라 제외) ③ CONFLICT → 재승인·취소 ④ 거절 클릭 → 사유 다이얼로그 → 빈 사유 시 확정 버튼 disabled → 사유 입력 후 mutate 인자 단언 ⑤ 승인 mutate의 onError에 `ApiError`(code='FACILITY_BOOKING_SCHOOL_CONFLICT', payload=conflicts)를 흘려 충돌 패널 문구(`문화팀 · 18:00~19:00`) 렌더 단언(mutate mock에서 콜백 즉시 호출 — `mockImplementation((vars, callbacks) => callbacks?.onError?.(new MockApiError(...)))` 패턴, MockApiError는 `vi.hoisted`로 status/code/payload 프로퍼티 포함).

- [ ] **Step 6: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 관리자 예약 상세 모달 — 신선도 배너·슬롯 스트립·액션 5종·승인 409 충돌 패널"
```

---

### Task 5: 메뉴 진입점 + 전체 검증 + QA

**Files:**
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts`

- [ ] **Step 1: adminSections 항목 추가**(재량 결정 ④ — '동아리' 그룹):

```ts
{
  href: '/admin/facility-bookings',
  title: '시설 예약 관리',
  description: '대관 신청 승인·학교 반영 확인·충돌 처리',
  group: '동아리',
},
```

(기존 항목 형태·타입을 열어 확인하고 동일하게. 사이드바·admin 홈 카드는 이 배열만 소비하므로 추가 작업 없음.)

- [ ] **Step 2: CI 4종**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm lint; echo "lint=$?"
pnpm typecheck; echo "typecheck=$?"
NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 pnpm build; echo "build=$?"
pnpm test; echo "test=$?"
```
Expected: 전부 0

- [ ] **Step 3: 실브라우저 QA**(컨트롤러 수행 — ADMIN 계정 자격증명이 없으므로 비로그인 범위): `/admin/facility-bookings` 진입 시 권한 가드 동작, admin 홈·사이드바에 메뉴 노출 여부(비로그인이면 가드에 막히므로 코드 확인으로 갈음), 콘솔 에러 없음. **로그인 필요한 플로우(카드·큐·액션·409 패널)는 hook-mock 테스트로 커버 — 실기기 확인은 사용자 QA 항목으로 이관**(보고에 명시).

- [ ] **Step 4: 커밋 + 클린 확인**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 관리자 콘솔 메뉴에 시설 예약 관리 추가"
git status --short
```

---

## Out of Scope (후속)

- 큐의 `conflictSuspected` 서버 필터 파라미터(현재 API에 없음 — P2에서 백엔드와 함께)
- 충돌·의심 탭의 APPROVED 쪽 전 페이지 스캔(P1은 현재 페이지 병합 — 재량 결정 ②)
- 알림·자동 CONFLICT 전환(P2)
- PR3/PR4 이연 목록(a11y 묶음 등)
