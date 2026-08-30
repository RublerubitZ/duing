import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type {
  BookingAvailabilitySlot,
  FacilityAvailabilityResponse,
  FacilityBookingSummary,
  FacilityItem,
  User,
} from '@duing/types';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import { seoulDateIso, shiftYearMonth, yearMonthLabel } from '@/app/facilities/_lib/facilityTimeline';
import { shiftDateByDays, weekDatesOf, weekRangeLabel } from '@/app/facilities/_lib/bookingCalendar';
import { FacilityBookingPage } from '@/app/facilities/_pages/FacilityBookingPage';

// 랜딩 = 캘린더(첫 시설 자동 선택). 딥링크는 각 시나리오가 mockSearchParams.value 로 제어한다
// (빈 문자열=첫 시설 캘린더, facilityId=1=커뮤니티룸 캘린더). 홈 카드 그리드는 캘린더에서 '전체 보기'로 연다.
// (vitest 규칙상 vi.mock 팩토리가 참조하는 외부 변수는 `mock` 접두사여야 한다.)
const mockSearchParams = { value: '' };
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(mockSearchParams.value),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  };
});

// 실행 시각 무관 결정성 — Date 만 고정한다(타이머는 실제 유지: MSW·waitFor 호환, toFake:['Date']).
// 설치/복원은 beforeEach/afterEach 로 매 테스트 스코프(하단 이월 블록 setSystemTime 전례와 동일) — 모듈 스코프
// 상주 설치는 케이스 누적 시 타이머 상태가 쌓여 flaky 타임아웃을 유발한다.
// 7/31 12:30 KST 고정: day>15 → 반월 창 [8/1..8/15]. 창 첫날(8/1 = 오늘+1)은 전날 12:00 경과라 신청 마감이므로
// WINDOW_FROM_CELL 로 마감 게이트를 검증하고, 폼 도달 플로우는 마감-안전한 APPLY_CELL(오늘+2 = 8/2)로 진입한다.
const FIXED_NOW = new Date('2026-07-31T12:30:00+09:00');
const TODAY_ISO = seoulDateIso(FIXED_NOW);
const CURRENT_MONTH = TODAY_ISO.slice(0, 7);

const pad2 = (value: number) => String(value).padStart(2, '0');

// 반월 오픈 창을 TODAY_ISO 에서 파생한다 — pivot 15, 백엔드 HalfMonthBookingWindowPolicy 미러.
// day<=15 → 당월 16~말일, day>15 → 익월 1~15. 픽스처·booking-window 핸들러가 공유한다.
function halfMonthWindow(todayIso: string): { from: string; until: string } {
  const [year, month, day] = todayIso.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  if ((day ?? 1) <= 15) {
    const lastDay = new Date(year ?? 1970, month ?? 1, 0).getDate();
    return { from: `${year}-${pad(month ?? 1)}-16`, until: `${year}-${pad(month ?? 1)}-${pad(lastDay)}` };
  }
  const nextMonthDate = new Date(year ?? 1970, month ?? 1, 1); // month는 1-based → Date(y, m, 1)=익월 1일
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  return { from: `${nextYear}-${pad(nextMonth)}-01`, until: `${nextYear}-${pad(nextMonth)}-15` };
}
const WINDOW = halfMonthWindow(TODAY_ISO);
const WINDOW_MONTH = WINDOW.from.slice(0, 7);
const WINDOW_FROM_DAY = Number(WINDOW.from.slice(8, 10));

// 창 첫날 셀(혼합 슬롯 → availableSlotCount 10 → 레벨 '여유'). 카드형 셀 접근성 이름은
// '레벨 + 남은 칸수'까지 포함해 월 폴백 전환기의 PAST/창밖 셀("N일"·"N일 예약 기간 아님")과 혼선을 차단한다.
const WINDOW_FROM_CELL = `${WINDOW_FROM_DAY}일 여유, 남은 10칸`;

// 폼 도달(신청) 플로우용 마감-안전 날짜: 오늘+2. 마감 = (오늘+2)-1 = 내일 → 고정 now(오늘) 기준 항상 미래라
// 마감 게이트를 통과한다(창 첫날 = 오늘+1 만 마감). 창 첫날과 동일한 혼합 슬롯을 실어(makeAvailability) 셀 라벨·
// 슬롯 셀렉터를 그대로 공유한다 → availableSlotCount 10 → 레벨 '여유'.
const APPLY_DATE_ISO = shiftDateByDays(TODAY_ISO, 2);
const APPLY_DAY = Number(APPLY_DATE_ISO.slice(8, 10));
const APPLY_CELL = `${APPLY_DAY}일 여유, 남은 10칸`;

// 창 월 안에 있으면서 창 밖(미래) 셀 — 토스트 가드 검증용.
// day<=15(창=16~말일)면 창 열기 직전 날(15일), day>15(창=익월1~15)면 창 닫힌 뒤 날(익월16일).
const OUT_OF_WINDOW_DATE = WINDOW_FROM_DAY === 16 ? `${WINDOW_MONTH}-15` : `${WINDOW_MONTH}-16`;
const OUT_OF_WINDOW_CELL = `${Number(OUT_OF_WINDOW_DATE.slice(8, 10))}일 예약 기간 아님`;

// windowRangeLabel 미러(M.d ~ M.d) — 배지("예약 가능 기간 …")·토스트("… (…)") 문구 단언용.
const labelPart = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const WINDOW_LABEL = `${labelPart(WINDOW.from)} ~ ${labelPart(WINDOW.until)}`;

// 주 시작(월요일) — weekDatesOf 는 항상 7개 반환, [0]=월요일(noUncheckedIndexedAccess 폴백).
const mondayOf = (iso: string) => weekDatesOf(iso)[0] ?? iso;
// 주간 뷰 진입 시 헤더 h2 에 뜨는 주 기간 라벨(창 첫날이 속한 주).
const WINDOW_FROM_WEEK_LABEL = weekRangeLabel(mondayOf(WINDOW.from));

// 주간 셀 탭 통합(§4)용 — 창 안에서 다른 요일 셀이 항상 존재하도록 '창 첫날+3일'이 속한 주를 기준으로
// 앵커(딥링크 진입일)와 다른 요일 타깃을 고른다(주 경계·일요일 엣지에서도 형제 요일이 보장됨).
// WINDOW.from 은 제외 — 운영노트 특수일이라 셀 aria 가 "기본 확보 시간 · 예약 신청 가능"으로 달라져
// "N일 15:00 가능" 매칭이 깨진다(창 첫날 요일이 월~목인 달에만 터지는 날짜 의존 실패 방지).
const CROSS_ANCHOR = shiftDateByDays(WINDOW.from, 3);
const CROSS_TARGET =
  weekDatesOf(CROSS_ANCHOR).find(
    (iso) =>
      iso >= WINDOW.from && iso <= WINDOW.until && iso.slice(0, 7) === WINDOW_MONTH
      && iso !== CROSS_ANCHOR && iso !== WINDOW.from,
  ) ?? WINDOW.from;
const CROSS_TARGET_DAY = Number(CROSS_TARGET.slice(8, 10));

// Rolling Window 구간 2건 — 단일 창(WINDOW)을 연속 분할한다(현재/다음). 절대 날짜 금지(WINDOW 파생).
// 계약(설계 §2): [0].startDate==bookableFrom, [last].endDate==bookableUntil, 현재.endDate 다음날==다음.startDate.
const WINDOW_UNTIL_DAY = Number(WINDOW.until.slice(8, 10));
const RANGE_SPLIT_DAY = WINDOW_FROM_DAY + Math.floor((WINDOW_UNTIL_DAY - WINDOW_FROM_DAY) / 2);
const NEXT_RANGE_FROM_DAY = RANGE_SPLIT_DAY + 1;
const CURRENT_RANGE = { startDate: WINDOW.from, endDate: `${WINDOW_MONTH}-${pad2(RANGE_SPLIT_DAY)}`, label: '현재 예약 가능' };
const NEXT_RANGE = { startDate: `${WINDOW_MONTH}-${pad2(NEXT_RANGE_FROM_DAY)}`, endDate: WINDOW.until, label: '다음 예약 가능' };
const BOOKING_RANGES = [CURRENT_RANGE, NEXT_RANGE];

// 구간 칩 텍스트("현재 예약 가능 M.d ~ M.d") — rangeDatesLabel(M.d ~ M.d) 미러.
const CURRENT_RANGE_CHIP = `${CURRENT_RANGE.label} ${labelPart(CURRENT_RANGE.startDate)} ~ ${labelPart(CURRENT_RANGE.endDate)}`;
const NEXT_RANGE_CHIP = `${NEXT_RANGE.label} ${labelPart(NEXT_RANGE.startDate)} ~ ${labelPart(NEXT_RANGE.endDate)}`;
// 다음 구간 시작일 셀(availableSlotCount 13 → 레벨 '여유') — 오픈 마커 제거 후 일반 셀과 동일.
const NEXT_RANGE_START_CELL = `${NEXT_RANGE_FROM_DAY}일 여유, 남은 13칸`;

// 창 첫날 셀에 배치할 13칸: 9시=SCHOOL(고정관념), 11시=SCHOOL(비호응원단), 12시=INTERNAL(예약됨), 14시=HOLD, 나머지 AVAILABLE
function makeMixedSlots(): BookingAvailabilitySlot[] {
  return Array.from({ length: 13 }, (_, index) => {
    const start = `${pad2(9 + index)}:00`;
    const end = `${pad2(10 + index)}:00`;
    if (index === 0)
      return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '고정관념' };
    if (index === 2)
      return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '비호응원단' };
    if (index === 3) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
    if (index === 5) return { start, end, status: 'PENDING_HOLD' as const };
    return { start, end, status: 'AVAILABLE' as const };
  });
}

// availability 는 요청 yearMonth 의 한 달 전체를 채운다. 창 밖 날짜도 데이터상 AVAILABLE 이며(게이팅은
// 페이지가 bookableFrom/Until 로 수행), 창 첫날과 신청 플로우용 APPLY_DATE 에만 혼합 슬롯을 둔다
// (마감된 창 첫날과 마감-안전한 APPLY_DATE 가 동일 레이아웃 → 셀 라벨·슬롯 셀렉터 공유). bookableFrom/Until 은 항상 반월 창.
function makeAvailability(facilityId: number, yearMonth: string): FacilityAvailabilityResponse {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate();
  return {
    facilityId,
    yearMonth,
    lastUpdatedAt: null,
    stale: false,
    bookableFrom: WINDOW.from,
    bookableUntil: WINDOW.until,
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const iso = `${yearMonth}-${pad2(index + 1)}`;
      if (iso < TODAY_ISO) {
        return { date: iso, dayStatus: 'PAST' as const, availableSlotCount: 0, operatingNotes: [], slots: [] };
      }
      if (iso === WINDOW.from || iso === APPLY_DATE_ISO) {
        return {
          date: iso,
          dayStatus: 'AVAILABLE' as const,
          availableSlotCount: 10,
          // 확보 시간 비차단 정보(스펙 §3 복원) — BE 가 BASIC_SECURED_TIME 슬라이스에서 채운다.
          operatingNotes: [{ organization: '고정관념', start: '09:00', end: '20:00' }],
          slots: makeMixedSlots(),
        };
      }
      return {
        date: iso,
        dayStatus: 'AVAILABLE' as const,
        availableSlotCount: 13,
        operatingNotes: [],
        slots: Array.from({ length: 13 }, (_, slotIndex) => ({
          start: `${pad2(9 + slotIndex)}:00`,
          end: `${pad2(10 + slotIndex)}:00`,
          status: 'AVAILABLE' as const,
        })),
      };
    }),
  };
}

function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, data, message: null });
}

// availability 핸들러는 요청 yearMonth 를 읽어 해당 월 응답을 준다(기본 월=창 월 검증·클램프 시나리오와 정합).
function availabilityHandlerFor(facilityId: number) {
  return http.get(`*/facilities/${facilityId}/availability`, ({ request }) => {
    const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? WINDOW_MONTH;
    return ok(makeAvailability(facilityId, yearMonth));
  });
}

// FacilityItem 전체 필드 픽스처 — 홈 카드(오늘 남은 칸 계산 등)가 usage 응답을 소비한다.
const FACILITY_A: FacilityItem = {
  id: 1,
  roomName: '커뮤니티룸(1)',
  location: null,
  isUsingNow: false,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};
const FACILITY_B: FacilityItem = {
  id: 2,
  roomName: '공동연습실(1)',
  location: null,
  isUsingNow: true,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};

const AUTH_USER: User = {
  id: 1,
  studentId: '20200001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'JUNIOR',
  role: 'STUDENT',
};

// MyBookingsChip 이 운영 동아리 1개일 때 조회하는 진행 중 신청 1건.
const PENDING_BOOKING: FacilityBookingSummary = {
  bookingId: 41,
  facilityId: 1,
  roomName: '커뮤니티룸(1)',
  date: WINDOW.from,
  startTime: '18:00',
  endTime: '19:00',
  status: 'PENDING',
  purpose: '정기 합주',
  createdAt: `${WINDOW.from}T18:00:00`,
};

const server = setupServer(
  http.get('*/facilities/usage', () =>
    ok({ yearMonth: CURRENT_MONTH, lastUpdatedAt: null, stale: false, source: 'CACHE', facilities: [FACILITY_A, FACILITY_B] }),
  ),
  availabilityHandlerFor(1),
  // 페이지가 useBookingWindowQuery 를 무조건 마운트하므로 기본 핸들러 필요(onUnhandledRequest:'error' 대비).
  // Rolling Window 전환 후 기본 응답은 구간 2건을 싣는다(구 응답 폴백은 시나리오 16에서 server.use 로 검증).
  http.get('*/facilities/booking-window', () =>
    ok({ bookableFrom: WINDOW.from, bookableUntil: WINDOW.until, availableBookingRanges: BOOKING_RANGES }),
  ),
  http.get('*/facilities/booking-purpose-presets', () =>
    ok([{ id: 1, label: '동아리 정기 모임' }, { id: 3, label: '정기 합주' }]),
  ),
  http.get('*/leader/clubs/me/managed', () =>
    ok([{ clubId: 7, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 0 }]),
  ),
  // 로그인+운영 동아리 1개면 MyBookingsChip 이 이 목록을 조회한다(기본은 진행 중 0건 → 칩 미노출).
  http.get('*/clubs/7/facility-bookings', () => ok([])),
  http.post('*/clubs/7/facility-bookings', () =>
    ok({ bookingId: 31, status: 'PENDING' as const, overlappingPendingCount: 1 }),
  ),
);

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // jsdom 은 window.matchMedia 가 없다 — motion/미디어쿼리 소비 컴포넌트용 stub(no-op 구독).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});
afterEach(() => {
  server.resetHandlers();
  mockSearchParams.value = '';
  vi.useRealTimers(); // 매 테스트 후 고정 Date 원복(누적 방지 + 다른 파일 누수 차단).
});
afterAll(() => server.close());

beforeEach(() => {
  // Date 만 고정(타이머 실제 유지) — 매 테스트 스코프 설치로 하단 이월 블록 pinSeoulNoon 과 정합.
  vi.useFakeTimers({ toFake: ['Date'], now: FIXED_NOW });
  // 기본은 부팅 초기값(시드 없는 미인증) — 로그인이 필요한 시나리오만 각자 authenticated 로 올린다.
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  // 랜딩 = 첫 시설 캘린더(자동 선택). 대부분의 시나리오는 캘린더(슬롯/폼) 플로우를 검증하므로
  // 딥링크 facilityId=1 로 선택 시설을 커뮤니티룸으로 고정한다. 홈 카드 그리드가 필요한 시나리오는
  // 캘린더에서 '전체 보기'를 눌러 진입한다(자동 첫 시설 선택을 명시적으로 끔).
  mockSearchParams.value = 'facilityId=1';
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }

  render(
    <Wrapper>
      <FacilityBookingPage />
    </Wrapper>,
  );
  return { queryClient };
}

// booking-window 응답이 React Query 캐시에 커밋될 때까지 결정적으로 대기한다.
// 월간 뷰에서 창 정보 UI(구간 칩)가 제거되어 DOM 대기 신호가 없고, 창 월=당월인 날짜
// (매월 1~15일)에는 셀 렌더가 windowQuery 완료를 함의하지 않으므로 캐시를 직접 관찰한다
// (실행 날짜에 따라 결과가 갈리는 시한폭탄 flaky 방지).
async function waitForBookingWindowLoaded(queryClient: QueryClient) {
  await waitFor(() => {
    const loaded = queryClient
      .getQueryCache()
      .getAll()
      .some((query) => query.queryKey.includes('booking-window') && query.state.data !== undefined);
    expect(loaded).toBe(true);
  });
}

describe('FacilityBookingPage — 월↔주 뷰 전환(반월 창)', () => {
  it('시나리오 1: 랜딩은 첫 시설 월간 캘린더로 직행하고, 전체 보기 → 홈 카드 그리드 → 카드 클릭으로 다시 월간으로 돌아온다', async () => {
    mockSearchParams.value = ''; // 딥링크 없음 → 첫 시설(커뮤니티룸) 월간 캘린더 직행
    renderPage();

    // 랜딩 = 첫 시설 월간 캘린더: h1 + 기간 라벨(창 월).
    expect(await screen.findByRole('heading', { level: 1, name: '커뮤니티룸(1) 예약' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) })).toBeInTheDocument();
    // (a) 초기 진입 = 월간 — 주간 사이드바(통합 예약 현황 카드)는 없다.
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();

    // 전체 보기 → 홈 카드 그리드. 헤더 기간 문단은 제거됐고, 기간은 시설 카드 안에서만 노출된다.
    fireEvent.click(await screen.findByRole('button', { name: '전체 보기' }));
    expect(await screen.findByText('예약할 시설을 골라보세요')).toBeInTheDocument();
    expect(screen.queryByText('예약 가능 기간')).not.toBeInTheDocument();
    expect((await screen.findAllByText(WINDOW_LABEL)).length).toBeGreaterThan(0);
    expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);

    // 커뮤니티룸 카드 클릭(카드 버튼 접근성 이름 = 시설명 … 날짜 보기) → 다시 창 월 월간 캘린더.
    fireEvent.click(screen.getByRole('button', { name: /커뮤니티룸\(1\).*날짜 보기/ }));
    expect(await screen.findByRole('heading', { level: 1, name: '커뮤니티룸(1) 예약' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) })).toBeInTheDocument();
  });

  it('시나리오 2: 딥링크 facilityId=1 은 월간 캘린더로 직행하고 콘텍스트 바·창 첫날 셀 레벨을 노출한다', async () => {
    renderPage();

    // 선택 시설(커뮤니티룸)은 드롭다운 트리거의 선택값으로 노출된다(다른 시설은 열기 전 비노출).
    expect(await screen.findByRole('button', { name: '시설 선택 — 현재 커뮤니티룸(1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 보기' })).toBeInTheDocument();

    // 창 첫날 셀(월간 그리드) = availableSlotCount 10 → 레벨 '여유'. 주간 사이드바는 아직 없다.
    const windowFromCell = await screen.findByRole('button', { name: WINDOW_FROM_CELL });
    expect(windowFromCell).toHaveTextContent('여유');
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();
  });

  it('시나리오 3 (뷰 전환 b): 월간 날짜 탭 → 주간 뷰로 전환하며 주 라벨·사이드바(요약·현황·시간 리스트)를 노출한다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));

    // 주간 전환: 헤더 기간 라벨이 주 범위로 바뀌고, 월간 셀(창 첫날)은 사라진다.
    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: WINDOW_FROM_CELL })).not.toBeInTheDocument();

    // 사이드바: 통합 예약 현황 카드 + 시간 선택 리스트.
    expect(screen.getByText('예약 현황')).toBeInTheDocument();
    // SCHOOL 단체명은 예약 현황 카드·슬롯 라벨 양쪽에 나타난다.
    expect((await screen.findAllByText('비호응원단')).length).toBeGreaterThan(0);
    // INTERNAL 비노출("예약됨")·PENDING_HOLD("승인 대기")도 현황·슬롯·요약 집계에 나타난다.
    expect(screen.getAllByText('예약됨').length).toBeGreaterThan(0);
    expect(screen.getAllByText('승인 대기').length).toBeGreaterThan(0);
    // 확보 시간 비차단 정보 표시(스펙 §3 복원) — 운영행은 정책 안내 박스로 승격(단체·시간 나열 + 고정 문구).
    // "기본 확보 시간"은 주간 범례에도 있어 박스 고유의 고정 문구로 단언한다.
    expect(screen.getAllByText('고정관념').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/학교와 협의되어 기본적으로 이 동아리가 사용하는 시간이에요/),
    ).toBeInTheDocument();
    expect(screen.getByText(/고정관념 09:00~20:00/)).toBeInTheDocument();
    // 예약 현황 카드엔 확보 통짜 행 "(기본 확보)" 접미 표기.
    expect(screen.getByText('(기본 확보)')).toBeInTheDocument();

    // 요약 카드 시간대 분포(오전 09–12 = AVAILABLE 1/3 — 09시 차단, 오후 12–18 = 4/6, 저녁 18–22 = 4/4).
    expect(screen.getByText('오전')).toBeInTheDocument();
    expect(screen.getByText('오후')).toBeInTheDocument();
    expect(screen.getByText('저녁')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });

  it('시나리오 4: 연속 슬롯 선택 시 병합 범위 CTA 가 활성화된다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));

    expect(screen.getByRole('button', { name: '18:00~20:00 예약 신청' })).toBeEnabled();
  });

  it('사용 인원 필수(2026-07-21): 인원 미입력이면 예약 신청 버튼이 비활성이고, 입력하면 활성화된다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    // 목적·연락처(프리필)는 채워졌지만 사용 인원이 비어 버튼이 비활성이다.
    expect(screen.getByRole('button', { name: '예약 신청' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });
    expect(screen.getByRole('button', { name: '예약 신청' })).toBeEnabled();

    // 0 은 유효하지 않아 다시 비활성(양수만 허용).
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: '예약 신청' })).toBeDisabled();
  });

  it('대표 연락처 자동 포맷(2026-07-21): 숫자만 입력해도 010-1234-5678 로 표기되고 11자리 초과는 잘린다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: { ...AUTH_USER, phone: '' } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');

    const contactInput = screen.getByRole('textbox', { name: '대표 연락처' });
    // 하이픈 없이 숫자만 입력해도 자동으로 하이픈이 들어간다.
    fireEvent.change(contactInput, { target: { value: '01012345678' } });
    expect(contactInput).toHaveValue('010-1234-5678');
    // 문자·초과 자릿수는 걸러지고 11자리까지만 유지된다.
    fireEvent.change(contactInput, { target: { value: '010abc1234567890' } });
    expect(contactInput).toHaveValue('010-1234-5678');
  });

  it('시나리오 5: 로그인 신청이 확인 Dialog 를 거쳐 성공하면 정확한 payload(대표 연락처 포함) 전송·승인 타임라인 노출 후 "다른 시설 예약하기"로 홈에 복귀한다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    let capturedBody: unknown = null;
    let postCount = 0;
    server.use(
      http.post('*/clubs/7/facility-bookings', async ({ request }) => {
        postCount += 1;
        capturedBody = await request.json();
        return ok({ bookingId: 31, status: 'PENDING' as const, overlappingPendingCount: 1 });
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~20:00 예약 신청' }));

    // 폼 단계에서도 스텝 인디케이터가 노출되고 '신청 확인'(2단계)이 활성으로 표시된다(§2.5).
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    expect(screen.getAllByLabelText('예약 진행 단계').length).toBeGreaterThan(0);
    expect(screen.getByText('신청 확인')).toBeInTheDocument();

    // 폼: Preset 칩 탭 → 목적 input 이 채워진다.
    expect(screen.getByRole('textbox', { name: '사용 목적' })).toHaveValue('정기 합주');

    // 운영진 동아리 목록 로드 대기 — canSubmit 이 clubId 확보 후에만 true 라 클릭 no-op 플레이크 방지.
    await screen.findByText('밴드부');
    // 대표 연락처는 프로필(/users/me)에 번호가 있으면 프리필된다(§2.1).
    expect(screen.getByRole('textbox', { name: '대표 연락처' })).toHaveValue('010-1234-5678');
    // 사용 인원은 필수(2026-07-21) — 입력해야 예약 신청 버튼이 활성화된다.
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });

    // 폼 "예약 신청" → 즉시 전송 대신 확인 Dialog 만 열린다(§2.2). 이 시점엔 POST 미발사.
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    expect(postCount).toBe(0);
    expect(capturedBody).toBeNull();

    // 실제 POST 는 Dialog 의 [예약 신청] 에서만 발사된다.
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '예약 신청' }));

    // 성공 화면: 세로 승인 타임라인(관리자 승인 대기 단계) + 겹침 경고.
    const timeline = await screen.findByLabelText('승인 진행 타임라인');
    expect(within(timeline).getByText('관리자 승인 대기')).toBeInTheDocument();
    expect(within(timeline).queryByText('보통')).not.toBeInTheDocument();
    expect(screen.getByText(/1건이 함께 대기/)).toBeInTheDocument();

    await waitFor(() => expect(capturedBody).not.toBeNull());
    // 사용 인원 필수화(2026-07-21) — attendeeCount 가 body 에 포함된다(toEqual 전체 비교로 보장).
    // date 는 마감-안전한 신청일. contactPhone 은 프리필 값이 그대로 실린다.
    expect(capturedBody).toEqual({
      facilityId: 1,
      date: APPLY_DATE_ISO,
      startTime: '18:00',
      endTime: '20:00',
      purpose: '정기 합주',
      attendeeCount: 15,
      contactPhone: '010-1234-5678',
    });
    expect(postCount).toBe(1); // 확인 클릭 1회 = POST 1회(중복 제출 없음)

    // "다른 시설 예약하기" → 홈 뷰 복귀(홈 카드 재노출로 확인).
    fireEvent.click(screen.getByRole('button', { name: '다른 시설 예약하기' }));
    expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);
  });

  it('시나리오 6: 창 밖 미래 셀을 탭하면 주간으로 전환하지 않고 기간이 담긴 토스트로 안내한다', async () => {
    const { queryClient } = renderPage();

    // 월 폴백→창 월 전환(제목 정착)·셀 확정·창 로딩(토스트 라벨 의존)을 모두 기다린 뒤 클릭.
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) });
    await screen.findByRole('button', { name: OUT_OF_WINDOW_CELL });
    await waitForBookingWindowLoaded(queryClient);

    fireEvent.click(screen.getByRole('button', { name: OUT_OF_WINDOW_CELL }));

    expect(
      await screen.findByText(`현재 예약 가능한 기간이 아니에요 (${WINDOW_LABEL})`),
    ).toBeInTheDocument();
    // 안내만 하고 주간 전환(사이드바·CTA)은 일어나지 않는다.
    expect(screen.queryByRole('button', { name: /예약 신청/ })).not.toBeInTheDocument();
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();
  });

  it('시나리오 7: 창 밖 날짜 딥링크는 주간을 열지 않고 스테일 date 를 정리해 월간으로 복귀하며 토스트로 안내한다', async () => {
    mockSearchParams.value = `facilityId=1&date=${OUT_OF_WINDOW_DATE}`;
    renderPage();

    // 창 로드 후 out-of-window 이펙트가 selectedDate 를 비우고 월간으로 되돌리며 토스트를 띄운다.
    expect(
      await screen.findByText(`현재 예약 가능한 기간이 아니에요 (${WINDOW_LABEL})`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /예약 신청/ })).not.toBeInTheDocument();
    expect(screen.queryByText('비호응원단')).not.toBeInTheDocument(); // 창 첫날 사이드바가 아님
    // 월간 그리드로 복귀 — 월간 셀이 다시 보이고 주간 사이드바는 없다.
    expect(await screen.findByRole('button', { name: WINDOW_FROM_CELL })).toBeInTheDocument();
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();
  });

  it('시나리오 8: PENDING_HOLD 슬롯을 포함하면 폼 상단에 홀드 경고가 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    // 대기(14~15) 슬롯은 §8 정정 후에도 그리드에선 비인터랙티브 블록(aria "…14:00~15:00 승인 대기"가
    // 이 정규식과 겹치기도 함) — 선택은 사이드바 시간 리스트로 스코프한다.
    const slotList = await screen.findByRole('list', { name: '시간대 선택' });
    fireEvent.click(within(slotList).getByRole('button', { name: /14:00~15:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '14:00~15:00 예약 신청' }));

    expect(
      await screen.findByText(/이미 예약 신청이 접수된 시간이 포함돼 있어요/),
    ).toBeInTheDocument();
  });

  it('시나리오 9: 비로그인은 전체 보기로 연 홈 뷰에서도 내 신청 칩이 없고 운영 동아리 조회도 발사되지 않는다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    mockSearchParams.value = ''; // 첫 시설 월간 직행 — MyBookingsChip 은 홈 상단에만 있다.

    const managedRequests: string[] = [];
    const trackManaged = ({ request }: { request: Request }) => {
      if (request.url.includes('/leader/clubs/me/managed')) managedRequests.push(request.url);
    };
    server.events.on('request:start', trackManaged);
    try {
      renderPage();

      // 월간 직행 → 전체 보기로 홈 뷰 진입. 홈 카드가 뜬 뒤 칩 부재·조회 미발사를 단언한다.
      fireEvent.click(await screen.findByRole('button', { name: '전체 보기' }));
      expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);
      expect(screen.queryByRole('link', { name: /내 신청/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /내 예약 관리/ })).not.toBeInTheDocument();
      expect(managedRequests).toHaveLength(0);
    } finally {
      server.events.removeListener('request:start', trackManaged);
    }
  });

  it('시나리오 10: 비로그인으로 예약을 진행하면 폼 대신 로그인 링크(복귀 next 포함)가 노출된다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    const loginLink = await screen.findByRole('link', { name: '로그인하기' });
    expect(loginLink.getAttribute('href')).toMatch(/^\/login\?next=/);
  });

  // 시드된 인증은 프로필(/users/me)보다 먼저 도착한다 — 폼은 그 시드로 즉시 열리고, 뒤늦게 온
  // 프로필의 번호가 아직 손대지 않은 연락처를 채운다(마운트 시점 초기값만으로는 프리필이 유실된다).
  it('시나리오 10-1: 시드된 인증이면 폼이 즉시 열리고 늦게 온 프로필 번호가 빈 연락처를 채운다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    // 로그인 안내도, 확인 중 자리표시도 없이 곧장 폼이다.
    await screen.findByText('밴드부');
    expect(screen.queryByRole('link', { name: '로그인하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '로그인 확인 중' })).not.toBeInTheDocument();
    const contactInput = screen.getByRole('textbox', { name: '대표 연락처' });
    expect(contactInput).toHaveValue('');

    await act(async () => {
      useAuthStore.setState({ user: AUTH_USER, isVerified: true });
    });
    expect(screen.getByRole('textbox', { name: '대표 연락처' })).toHaveValue('010-1234-5678');
  });

  it('시나리오 10-2: 사용자가 연락처를 입력한 뒤에 온 프로필은 입력값을 덮지 않는다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    await screen.findByText('밴드부');

    fireEvent.change(screen.getByRole('textbox', { name: '대표 연락처' }), {
      target: { value: '01099998888' },
    });
    await act(async () => {
      useAuthStore.setState({ user: AUTH_USER, isVerified: true });
    });

    expect(screen.getByRole('textbox', { name: '대표 연락처' })).toHaveValue('010-9999-8888');
  });

  it('시나리오 11: 로그인 운영진(동아리 1개)에 진행 중 신청이 있으면 전체 보기로 연 홈에서 관리 목록 칩이 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(http.get('*/clubs/7/facility-bookings', () => ok([PENDING_BOOKING])));
    mockSearchParams.value = ''; // 첫 시설 월간 직행 — MyBookingsChip 은 홈 뷰 상단에 있어 전체 보기로 연다

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '전체 보기' }));

    const chipLink = await screen.findByRole('link', { name: /내 신청 1건 진행 중/ });
    expect(chipLink).toHaveAttribute('href', '/manage/clubs/7/facility-bookings');
  });

  it('시나리오 12: 신청이 409 로 실패하면 재조회 후 무효해진 선택을 비우고 슬롯 화면으로 돌아간다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });

    let conflictBlocked = false;
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? WINDOW_MONTH;
        const availability = makeAvailability(1, yearMonth);
        if (conflictBlocked) {
          const applyDay = availability.days.find((day) => day.date === APPLY_DATE_ISO);
          if (applyDay) {
            applyDay.slots = applyDay.slots.map((slot) =>
              slot.start === '18:00'
                ? { start: slot.start, end: slot.end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const }
                : slot,
            );
          }
        }
        return ok(availability);
      }),
      http.post('*/clubs/7/facility-bookings', () => {
        conflictBlocked = true;
        return HttpResponse.json(
          { ok: false, data: null, message: '이미 예약된 시간이에요.' },
          { status: 409 },
        );
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });
    // 폼 "예약 신청" → 확인 Dialog. 실제 POST 는 Dialog 확인에서만(§2.2).
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '예약 신청' }));

    // 409/에러는 기존 경로 그대로 — Dialog 닫힘 + 경합 에러 토스트 + 재조회 후 슬롯 화면 복귀(선택 초기화 → CTA 비활성).
    expect(await screen.findByText('이미 예약된 시간이에요.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '예약을 신청하시겠어요?' })).not.toBeInTheDocument(),
    );
    const disabledCta = await screen.findByRole('button', { name: '시간을 선택해주세요' });
    expect(disabledCta).toBeDisabled();
  });

  it('시나리오 13: 로그인 상태에서 운영진 동아리 조회가 실패하면 폼에 에러·재시도가 노출된다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        HttpResponse.json({ ok: false, data: null, message: '오류' }, { status: 500 }),
      ),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByText('동아리 정보를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('시나리오 13-1 (§2.1·§2.2): 대표 연락처 미입력이면 버튼 비활성, 형식 오류면 확인 Dialog 가 열리지 않고 한국어 오류를 노출한다', async () => {
    // 프로필에 번호가 없으면 프리필되지 않아 빈 값으로 시작한다(§2.1).
    useAuthStore.setState({ status: 'authenticated', user: { ...AUTH_USER, phone: '' } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    // 사용 인원은 필수 — 연락처만 변수로 두기 위해 먼저 채운다.
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });

    const contactInput = screen.getByRole('textbox', { name: '대표 연락처' });
    expect(contactInput).toHaveValue(''); // 번호 없음 → 프리필 생략

    // (미입력) 대표 연락처가 비면 필수항목 미충족 — 예약 신청 버튼이 비활성이라 Dialog 가 열리지 않는다(2026-07-21).
    expect(screen.getByRole('button', { name: '예약 신청' })).toBeDisabled();

    // (형식 오류) 값이 있으면 버튼은 활성 — 확인 클릭 시점에 형식 오류를 메시지로 노출하고 Dialog 는 안 열린다.
    fireEvent.change(contactInput, { target: { value: '0101234' } });
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    expect(screen.queryByRole('dialog', { name: '예약을 신청하시겠어요?' })).not.toBeInTheDocument();
    expect(screen.getByText('휴대폰 번호 형식으로 입력해주세요.')).toBeInTheDocument();

    // (유효 — 하이픈 없이 입력해도 자동 포맷되어 통과) → Dialog 열림.
    fireEvent.change(contactInput, { target: { value: '01012345678' } });
    expect(contactInput).toHaveValue('010-1234-5678');
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    expect(await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' })).toBeInTheDocument();
  });

  it('시나리오 13-2 (§2.2): 확인 Dialog 의 [취소] 는 POST 없이 다이얼로그만 닫고 폼을 유지한다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    let postCount = 0;
    server.use(
      http.post('*/clubs/7/facility-bookings', () => {
        postCount += 1;
        return ok({ bookingId: 31, status: 'PENDING' as const, overlappingPendingCount: 0 });
      }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });

    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));

    // Dialog 닫힘 + 폼 유지(목적 input 잔존) + POST 미발사.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '예약을 신청하시겠어요?' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('textbox', { name: '사용 목적' })).toHaveValue('정기 합주');
    expect(postCount).toBe(0);
  });

  it('신청 마감 게이트: 전날 12:00 이 지난 날짜(창 첫날)는 폼 대신 마감 안내가 보인다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    // WINDOW.from(= 오늘+1)은 전날 12:00 이 지나 마감 — 폼 대신 마감 안내(role=alert). 표시용 힌트(최종 판단은 서버).
    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('시설 사용일 전날 12:00까지만 신청할 수 있어요.');
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument();
  });

  it('중앙동아리 게이트: 중앙동아리가 아닌 운영 동아리만 있으면 안내가 보이고 폼이 숨는다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        ok([{ clubId: 7, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', centralClub: false, activeRecruitmentCount: 0 }]),
      ),
    );
    renderPage();

    // APPLY_CELL(마감-안전 날짜)로 폼 스텝 진입 — 중앙동아리 필터(fail-open)로 폼 대신 안내.
    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByText(/시설 예약은 중앙동아리만 신청할 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument();
  });

  it('서버 마감 거부: 서버가 마감 코드로 400 하면 서버 메시지가 토스트로 보인다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.post('*/clubs/7/facility-bookings', () =>
        HttpResponse.json(
          {
            ok: false,
            data: null,
            message: '시설 사용일 전날 12:00까지만 신청할 수 있어요.',
            code: 'FACILITY_BOOKING_DEADLINE_PASSED',
          },
          { status: 400 },
        ),
      ),
    );
    renderPage();

    // APPLY_CELL 경유로 폼 작성·확인 다이얼로그까지 기존 성공 플로우와 동일 절차로 진행한 뒤 제출 → 서버 400.
    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '예약 신청' }));

    // onError 토스트 = 서버 message 그대로(= 사용자 문구, 별도 매핑 없음).
    expect(await screen.findByText('시설 사용일 전날 12:00까지만 신청할 수 있어요.')).toBeInTheDocument();
  });

  it('시나리오 14: 지난달 딥링크는 창 월로 클램프해 무효(스테일) 월 availability 요청 없이 월간 캘린더를 렌더한다', async () => {
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    mockSearchParams.value = `facilityId=1&date=${lastMonth}-15`;

    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth');
        if (yearMonth !== null) requestedYearMonths.push(yearMonth);
        return ok(makeAvailability(1, yearMonth ?? WINDOW_MONTH));
      }),
    );

    renderPage();

    // 딥링크 월(지난달)은 창 밖 → 정리 후 월간 캘린더가 창 월 기준으로 정상 렌더된다.
    expect(await screen.findByRole('button', { name: WINDOW_FROM_CELL })).toBeInTheDocument();
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();

    await waitFor(() => expect(requestedYearMonths).toContain(WINDOW_MONTH));
    expect(requestedYearMonths).not.toContain(lastMonth);
  });

  it('시나리오 15: booking-window 구간이 있어도 상단 기간 표기·오픈 마커 없이 셀 상태로만 창을 표현한다', async () => {
    const { queryClient } = renderPage();

    // 창 로딩 이후에도 기간 텍스트·배지·마커는 없고, 다음 구간 시작일 셀은 일반 셀과 동일하다.
    expect(await screen.findByRole('button', { name: NEXT_RANGE_START_CELL })).toBeInTheDocument();
    await waitForBookingWindowLoaded(queryClient);
    expect(screen.queryByText(CURRENT_RANGE_CHIP)).not.toBeInTheDocument();
    expect(screen.queryByText(NEXT_RANGE_CHIP)).not.toBeInTheDocument();
    expect(screen.queryByText('오픈')).not.toBeInTheDocument();
  });

  it('시나리오 16: booking-window 응답에 구간이 없어도 상단 기간 표기는 렌더되지 않는다', async () => {
    server.use(
      http.get('*/facilities/booking-window', () => ok({ bookableFrom: WINDOW.from, bookableUntil: WINDOW.until })),
    );
    const { queryClient } = renderPage();

    // 구간이 없어도(창 로딩 완료 후) 상단 기간 표기는 없다.
    await screen.findByRole('button', { name: OUT_OF_WINDOW_CELL });
    await waitForBookingWindowLoaded(queryClient);
    expect(screen.queryByText(`예약 가능 기간 ${WINDOW_LABEL}`)).not.toBeInTheDocument();
    expect(screen.queryByText(CURRENT_RANGE_CHIP)).not.toBeInTheDocument();
  });

  it('시나리오 17 (뷰 전환 c): 주간에서 [월] 탭 시 월간 복귀·선택 유지(셀 강조)하고 [주] 재탭 시 그 주로 돌아온다', async () => {
    renderPage();

    // 월간 셀 탭 → 주간 진입 후 슬롯(18:00~19:00) 선택.
    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    expect(screen.getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();

    // [월] 탭 → 월간 복귀. 선택일 셀이 강조(aria-pressed)되고 사이드바는 사라진다.
    fireEvent.click(screen.getByRole('tab', { name: '월' }));
    const selectedCell = await screen.findByRole('button', { name: WINDOW_FROM_CELL });
    expect(selectedCell).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();

    // [주] 재탭 → 그 주로 복귀하며 선택(18:00~19:00)이 유지된다.
    fireEvent.click(screen.getByRole('tab', { name: '주' }));
    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();
  });

  it('시나리오 18 (뷰 전환 d): 선택 없이 [주] 탭 시 창 기준일(오늘이 창 밖이면 bookableFrom)이 속한 주로 진입한다', async () => {
    mockSearchParams.value = 'facilityId=1'; // 날짜 딥링크 없음 → 월간
    const { queryClient } = renderPage();

    // 월간 진입 + 창 로드 대기 — showWeekView 가 windowQuery 로 기준일을 정하므로 캐시 커밋을 기다린다.
    await screen.findByRole('button', { name: WINDOW_FROM_CELL });
    await waitForBookingWindowLoaded(queryClient);
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();

    // [주] 탭 — 오늘은 반월 창 밖이라 기준일 = bookableFrom. 그 주 라벨·사이드바가 뜬다.
    fireEvent.click(screen.getByRole('tab', { name: '주' }));
    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.getByText('예약 현황')).toBeInTheDocument();
  });

  it('시나리오 19 (뷰 전환 e): 날짜 딥링크는 주간 뷰로 진입한다', async () => {
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.getByText('예약 현황')).toBeInTheDocument();
    // 주간 슬롯 선택 리스트가 사이드바에 있다.
    expect(screen.getByRole('button', { name: /18:00~19:00/ })).toBeInTheDocument();
    // 월간 셀은 없다(그리드가 주간으로 교체됨).
    expect(screen.queryByRole('button', { name: WINDOW_FROM_CELL })).not.toBeInTheDocument();
  });

  // 시나리오 20 은 matchMedia 를 모바일(matches:true)로 덮으므로 종료 후 원복이 필요하다(후속 시나리오 누수 방지).
  it('시나리오 20 (§11.2 주간=보조): 모바일에서 [주] 탭으로 연 주간 뷰는 바텀시트(dialog) 없이 사이드바가 세로 스택된다', async () => {
    // 모바일 매치미디어 — 월간 날짜 탭은 시트를 열지만(§11.1), [주] 탭으로 연 주간 뷰는 시트 없이 스택된다(§11.2).
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    mockSearchParams.value = 'facilityId=1';
    const { queryClient } = renderPage();

    // 창 로드 대기 — showWeekView 가 windowQuery 로 기준일을 정하므로 캐시 커밋을 기다린 뒤 [주] 탭 진입.
    await screen.findByRole('button', { name: WINDOW_FROM_CELL });
    await waitForBookingWindowLoaded(queryClient);
    fireEvent.click(screen.getByRole('tab', { name: '주' }));

    // 사이드바 콘텐츠가 본문에 스택 — 바텀시트(dialog)는 없다.
    expect(await screen.findByText('예약 현황')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /18:00~19:00/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // matchMedia 원복(matches:false) — 후속 시나리오로 모바일 스텁이 누수되지 않게 한다.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  it('시나리오 21 (뷰 전환 g): 주간 이동 화살표는 창 주 범위로 캡되고 이동 시 주 라벨이 갱신된다', async () => {
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    // 첫 주(창 시작 주) — 이전 주 비활성, 창 로드 후 다음 주 활성.
    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 주' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: '다음 주' })).toBeEnabled());

    // 다음 주 이동 → 라벨이 다음 주로 갱신되고 이전 주가 활성화된다.
    const secondWeekLabel = weekRangeLabel(mondayOf(shiftDateByDays(WINDOW.from, 7)));
    fireEvent.click(screen.getByRole('button', { name: '다음 주' }));
    expect(await screen.findByRole('heading', { level: 2, name: secondWeekLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 주' })).toBeEnabled();
  });

  it('시나리오 22 (뷰 전환 g-끝): 창 마지막 주에서는 다음 주 이동이 비활성이다', async () => {
    mockSearchParams.value = `facilityId=1&date=${WINDOW.until}`;
    renderPage();

    const lastWeekLabel = weekRangeLabel(mondayOf(WINDOW.until));
    expect(await screen.findByRole('heading', { level: 2, name: lastWeekLabel })).toBeInTheDocument();
    // 창 로드 확인(이전 주 활성) 후 다음 주 비활성을 단언한다.
    await waitFor(() => expect(screen.getByRole('button', { name: '이전 주' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
  });

  it('시나리오 23 (셀 탭 통합 a): 주간 그리드에서 선택일의 가능 셀을 탭하면 선택이 토글되고 연속 탭으로 범위가 병합된다', async () => {
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    // 주간 진입 확인 — 창 첫날이 선택일.
    await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL });

    // 창 첫날 18·19시는 확보 창(09~20) 안의 점선 가이드 셀 — 일반 가용 셀과 동일하게 탭 선택.
    // 선택일 컬럼(창 첫날)의 18:00 셀 탭 → 18:00~19:00 단일 선택(CTA 활성).
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(`${WINDOW_FROM_DAY}일 18:00 기본 확보 시간 · 예약 신청 가능`) }),
    );
    expect(screen.getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();

    // 인접 19:00 셀 연속 탭 → 18:00~20:00 병합 범위.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${WINDOW_FROM_DAY}일 19:00 기본 확보 시간 · 예약 신청 가능`) }));
    expect(screen.getByRole('button', { name: '18:00~20:00 예약 신청' })).toBeEnabled();
  });

  it('시나리오 24 (셀 탭 통합 b): 주간 그리드에서 다른 요일의 가능 셀을 탭하면 그 날짜로 전환하고 해당 슬롯을 단일 선택한다', async () => {
    mockSearchParams.value = `facilityId=1&date=${CROSS_ANCHOR}`;
    renderPage();

    // 앵커일(창 첫날+3일)로 주간 진입 — 앵커 헤더가 "· 선택"으로 강조된다.
    await screen.findByRole('button', { name: new RegExp(`${Number(CROSS_ANCHOR.slice(8, 10))}일 · 선택`) });

    // 다른 요일(타깃) 15:00 가능 셀 탭 → 그 날짜로 selectedDate 전환 + 15:00~16:00 단일 선택.
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${CROSS_TARGET_DAY}일 15:00 가능`) }));

    // 선택 컬럼이 타깃으로 이동(타깃 헤더 "· 선택")하고 CTA 가 그 슬롯으로 활성화된다.
    expect(await screen.findByRole('button', { name: new RegExp(`${CROSS_TARGET_DAY}일 · 선택`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '15:00~16:00 예약 신청' })).toBeEnabled();
  });

  it('시나리오 25 (셀 탭 통합 c): 성공 화면에서 같은 날 셀을 탭하면 확정 범위를 변조하지 않고 새 신청(슬롯 단계)으로 리셋된다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.post('*/clubs/7/facility-bookings', () =>
        ok({ bookingId: 32, status: 'PENDING' as const, overlappingPendingCount: 0 }),
      ),
    );
    renderPage();

    // 성공 화면까지 진행(신청일 18~19시) — 확인 Dialog 경유(§2.2). 마감-안전한 APPLY_DATE 로 폼 진입.
    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    fireEvent.change(screen.getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '예약 신청' }));
    await screen.findByLabelText('승인 진행 타임라인');

    // 같은 날 주간 셀(19:00 — 확보 구간 내 점선 가이드 셀) 탭 → 성공 화면 범위 변조 대신 슬롯 단계 + 19:00 단일 선택으로 리셋.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${APPLY_DAY}일 19:00 기본 확보 시간 · 예약 신청 가능`) }));
    expect(screen.queryByLabelText('승인 진행 타임라인')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '19:00~20:00 예약 신청' })).toBeEnabled();
  });

  // 시나리오 26/27 은 matchMedia 를 오버라이드하므로 종료 후 원복이 필요하다(후속 시나리오 누수 방지 — 시나리오 20 전례).
  const setMatchMedia = (matches: boolean) =>
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });

  it('시나리오 26 (모바일 블록 시트 §9.3): 모바일 주간에서 가용 셀 탭은 선택, 확정 블록 탭은 라벨·시간·예약됨 배지 바텀시트를 연다', async () => {
    setMatchMedia(true); // 모바일 — 블록 disabled(PC) ↔ 시트 트리거(모바일) 게이트가 열린다.
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    // 모바일 딥링크 = 월간+빠른 예약 시트(§11.1). 주간 블록 시트(§9.3)를 보려면 시트에서 시간표로 전환한다.
    // 딥링크는 시트가 가용성 로드 전에 열릴 수 있어 시트 본문(시간표로 보기)을 findBy 로 기다린다.
    const daySheet = await screen.findByRole('dialog');
    fireEvent.click(await within(daySheet).findByRole('button', { name: '시간표로 보기' }));
    await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL });

    // 가용(확보 구간 점선 가이드) 셀 탭은 모바일에서도 선택 동작 — 시트가 아니다(§9.3).
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${WINDOW_FROM_DAY}일 18:00 기본 확보 시간 · 예약 신청 가능`) }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();

    // 확정 블록(11:00~12:00 비호응원단) 탭 → 상세 바텀시트.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${WINDOW_FROM_DAY}일 11:00~12:00 비호응원단 예약됨`) }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('비호응원단')).toBeInTheDocument();
    expect(within(dialog).getByText('11:00~12:00')).toBeInTheDocument();
    expect(within(dialog).getByText('예약됨')).toBeInTheDocument();

    setMatchMedia(false); // 원복 — 후속 시나리오로 모바일 스텁 누수 방지.
  });

  it('시나리오 27 (PC 블록 비인터랙티브 §9.3): 데스크탑 뷰포트에서 주간 확정 블록은 disabled 이고 탭해도 시트가 없다', async () => {
    setMatchMedia(false); // 데스크탑(기본) — 명시적으로 고정.
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL });
    const block = await screen.findByRole('button', { name: new RegExp(`${WINDOW_FROM_DAY}일 11:00~12:00 비호응원단 예약됨`) });
    expect(block).toBeDisabled();
    fireEvent.click(block); // disabled → no-op
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── 모바일 빠른 예약 바텀시트(§11.1) — 월간 날짜 탭 = 빠른 시간 선택, 주간은 보조 ─────
  // 시트 열림 중 월간 본문은 다이얼로그 뒤 aria-hidden 이라, 월간 유지 단언은 hidden:true 로 조회한다.
  const SHEET_TITLE = bookingDateLabel(WINDOW.from);

  it('시나리오 28 (모바일 §11.1 a·b): 월간 날짜 탭은 주간 전환 대신 빠른 예약 시트를 열고, 시트 슬롯 탭이 CTA 를 활성화한다', async () => {
    setMatchMedia(true);
    mockSearchParams.value = 'facilityId=1';
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));

    // (a) 시트(dialog) 열림 + 날짜 제목·슬롯 리스트.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(SHEET_TITLE)).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: '시간대 선택' })).toBeInTheDocument();
    // 월간 유지 — 주간 그리드(주 라벨 헤딩)로 전환하지 않고, 월간 헤딩이 뒤에 남아 있다.
    expect(screen.queryByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH), hidden: true }),
    ).toBeInTheDocument();
    // 통합 예약 현황 카드는 시트에 없다(§11.1 — 현황은 주간 뷰 담당).
    expect(within(dialog).queryByText('예약 현황')).not.toBeInTheDocument();

    // (b) 시트 슬롯 탭 → CTA 활성.
    const slotList = within(dialog).getByRole('list', { name: '시간대 선택' });
    fireEvent.click(within(slotList).getByRole('button', { name: /18:00~19:00/ }));
    expect(within(dialog).getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();

    setMatchMedia(false);
  });

  it('시나리오 29 (모바일 §11.1 c): 시트의 "시간표로 보기"는 시트를 닫고 주간으로 전환하며 선택을 유지한다', async () => {
    setMatchMedia(true);
    mockSearchParams.value = 'facilityId=1';
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    const dialog = await screen.findByRole('dialog');
    const slotList = within(dialog).getByRole('list', { name: '시간대 선택' });
    fireEvent.click(within(slotList).getByRole('button', { name: /18:00~19:00/ }));

    fireEvent.click(within(dialog).getByRole('button', { name: '시간표로 보기' }));

    // 주간 전환 + 시트 닫힘 + 선택 유지(주간 사이드바 CTA 활성).
    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('예약 현황')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18:00~19:00 예약 신청' })).toBeEnabled();

    setMatchMedia(false);
  });

  it('시나리오 30 (모바일 §11.1 d): 시트를 닫으면(Escape) 월간을 유지하고 선택을 정리한다', async () => {
    setMatchMedia(true);
    mockSearchParams.value = 'facilityId=1';
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    const dialog = await screen.findByRole('dialog');
    const slotList = within(dialog).getByRole('list', { name: '시간대 선택' });
    fireEvent.click(within(slotList).getByRole('button', { name: /18:00~19:00/ }));

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

    // 시트 닫힘 + 월간 유지 + 선택 정리(선택일 셀 강조 해제).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) })).toBeInTheDocument();
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: WINDOW_FROM_CELL })).toHaveAttribute('aria-pressed', 'false');

    setMatchMedia(false);
  });

  it('시나리오 31 (모바일 §11.1 e): 날짜 딥링크는 모바일에서 주간이 아니라 월간+빠른 예약 시트로 진입한다', async () => {
    setMatchMedia(true);
    mockSearchParams.value = `facilityId=1&date=${WINDOW.from}`;
    renderPage();

    const dialog = await screen.findByRole('dialog');
    // 딥링크는 시트가 가용성 로드 전에 열릴 수 있어 날짜 제목을 findBy 로 기다린다.
    expect(await within(dialog).findByText(SHEET_TITLE)).toBeInTheDocument();
    // 월간 유지 — 주간 그리드로 진입하지 않는다.
    expect(screen.queryByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH), hidden: true }),
    ).toBeInTheDocument();

    setMatchMedia(false);
  });

  it('시나리오 32 (PC §11.1 f 무회귀): 데스크탑에서는 월간 날짜 탭이 기존대로 주간으로 전환하고 시트는 열리지 않는다', async () => {
    setMatchMedia(false);
    mockSearchParams.value = 'facilityId=1';
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));

    expect(await screen.findByRole('heading', { level: 2, name: WINDOW_FROM_WEEK_LABEL })).toBeInTheDocument();
    expect(screen.getByText('예약 현황')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('시나리오 33 (모바일 §11.1 item5): 시트 안에서 폼→성공까지 신청이 진행되고, 시간표로 보기는 폼 단계에서 숨는다', async () => {
    setMatchMedia(true);
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    mockSearchParams.value = 'facilityId=1';
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    const dialog = await screen.findByRole('dialog');
    const slotList = within(dialog).getByRole('list', { name: '시간대 선택' });
    fireEvent.click(within(slotList).getByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '18:00~19:00 예약 신청' }));

    // 폼 단계도 시트 안에서 진행 — 시간표로 보기는 slots 스텝 전용이라 숨는다.
    fireEvent.click(await within(dialog).findByRole('button', { name: '정기 합주' }));
    expect(within(dialog).queryByRole('button', { name: '시간표로 보기' })).not.toBeInTheDocument();
    await within(dialog).findByText('밴드부');
    fireEvent.change(within(dialog).getByRole('textbox', { name: '사용 인원' }), { target: { value: '15' } });
    // 폼 "예약 신청" → 확인 Dialog(포털은 시트 밖). 실제 POST 는 Dialog 확인에서만(§2.2).
    fireEvent.click(within(dialog).getByRole('button', { name: '예약 신청' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '예약을 신청하시겠어요?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '예약 신청' }));

    // 성공 화면도 시트 안에서 — 승인 타임라인 노출.
    expect(await within(dialog).findByLabelText('승인 진행 타임라인')).toBeInTheDocument();

    setMatchMedia(false);
  });
});

// ── 주간 이월(두 달 걸침) 게이팅 버그 수정(§12) ─────────────────────────────────
// 이월 주(월 경계를 넘는 주)는 실제 달력상 특정 today 에서만 생긴다(익월 1일이 월요일이면 아예 없음).
// 결정적 재현을 위해 클록을 특정일에 고정한다 — 이는 만료되는 미래 절대날짜(타임밤)가 아니라 '고정된 현재'이고,
// 창·셀·헤더는 모두 그 고정 today 에서 파생한다(레포 setSystemTime 전례 9곳). 실제 반월 정책은 today.day>15 이면
// 창이 [당월-16 .. 익월-15] 로 월 경계를 넘어, 이월 주 양쪽이 모두 창 안이 되는 게 이 버그의 무대다.
describe('FacilityBookingPage — 주간 이월(두 달 걸침) 게이팅(§12)', () => {
  // 하루 09~21시 13칸 전부 AVAILABLE·운영 노트 없음(셀 aria = "가능"). 창은 인자로 주입해 시나리오별 in/out 을 가른다.
  function flatAvailability(
    facilityId: number,
    yearMonth: string,
    bookableFrom: string,
    bookableUntil: string,
  ): FacilityAvailabilityResponse {
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate();
    return {
      facilityId,
      yearMonth,
      lastUpdatedAt: null,
      stale: false,
      bookableFrom,
      bookableUntil,
      days: Array.from({ length: daysInMonth }, (_, index) => ({
        date: `${yearMonth}-${pad2(index + 1)}`,
        dayStatus: 'AVAILABLE' as const,
        availableSlotCount: 13,
        operatingNotes: [],
        slots: Array.from({ length: 13 }, (_, slotIndex) => ({
          start: `${pad2(9 + slotIndex)}:00`,
          end: `${pad2(10 + slotIndex)}:00`,
          status: 'AVAILABLE' as const,
        })),
      })),
    };
  }

  // Asia/Seoul 정오(UTC 03:00)로 고정 — 머신 TZ 무관하게 seoulDateIso 가 목표일을 낸다.
  const pinSeoulNoon = (dateIso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${dateIso}T03:00:00Z`));
  };

  // 창(booking-window)·availability(요청 yearMonth 전부) 핸들러를 주입하고, 조회된 yearMonth 를 기록한다.
  function installCarryoverHandlers(bookableFrom: string, bookableUntil: string): string[] {
    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/booking-window', () =>
        ok({ bookableFrom, bookableUntil, availableBookingRanges: null }),
      ),
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? bookableFrom.slice(0, 7);
        requestedYearMonths.push(yearMonth);
        return ok(flatAvailability(1, yearMonth, bookableFrom, bookableUntil));
      }),
    );
    return requestedYearMonths;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('(a) 7/27~8/2 주: 창이 8월로 이어지면 8/1·8/2 셀·헤더가 활성이다(인접월 병합)', async () => {
    pinSeoulNoon('2026-07-20'); // day>15 → 창 [7/16 .. 8/15] 가 월 경계를 넘는다
    const requestedYearMonths = installCarryoverHandlers('2026-07-16', '2026-08-15');
    mockSearchParams.value = 'facilityId=1&date=2026-07-27'; // 조회 월=7월, 주는 8월로 이월

    renderPage();

    await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf('2026-07-27')) });

    // 인접월(8월) 데이터가 병합되면 8/1(토)·8/2(일) 헤더가 활성이 된다(수정 전엔 데이터 없음→비활성=버그).
    await waitFor(() => expect(screen.getByRole('button', { name: '토요일 1일' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '일요일 2일' })).toBeEnabled();
    // 8/1 09:00 셀도 탭 가능(가용).
    expect(screen.getByRole('button', { name: '토요일 1일 09:00 가능' })).toBeEnabled();
    // 8월 availability 를 실제로 조회했다.
    await waitFor(() => expect(requestedYearMonths).toContain('2026-08'));
  });

  it('(b) 회귀: 창이 8월로 이어지지 않으면 병합돼도 8/1·8/2 는 창 밖이라 비활성이다(날짜 기준 판정)', async () => {
    pinSeoulNoon('2026-07-10'); // day<=15 → 창 [7/16 .. 7/31] 이 월 경계에서 끝난다
    const requestedYearMonths = installCarryoverHandlers('2026-07-16', '2026-07-31');
    mockSearchParams.value = 'facilityId=1&date=2026-07-27';

    renderPage();

    await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf('2026-07-27')) });

    // 7/31(금)은 창 안 → 헤더 활성.
    await waitFor(() => expect(screen.getByRole('button', { name: '금요일 31일' })).toBeEnabled());
    // 8월도 익월이라 조회는 되지만(병합), 8/1·8/2 는 창(7/31) 밖이라 날짜 기준으로 비활성이다(회귀 방지).
    await waitFor(() => expect(requestedYearMonths).toContain('2026-08'));
    expect(screen.getByRole('button', { name: '토요일 1일' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '일요일 2일' })).toBeDisabled();
  });

  it('(c) 인접월이 {당월,익월} 밖이면 추가 조회 없이 비활성이다(창을 넓혀 조회범위 게이트만 분리)', async () => {
    pinSeoulNoon('2026-07-20'); // 당월=7월, 익월=8월 → 9월은 조회 범위 밖
    // 창을 9월까지 인위적으로 넓혀(불변식 밖) 창 게이트가 아니라 {당월,익월} 조회 범위 게이트만 검증한다.
    const requestedYearMonths = installCarryoverHandlers('2026-07-16', '2026-09-30');
    mockSearchParams.value = 'facilityId=1&date=2026-08-31'; // 조회 월=8월, 주는 9월로 이월

    renderPage();

    await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf('2026-08-31')) });

    // 8월(조회 월)은 조회되고, 9월은 익월 밖이라 창 안이어도 조회하지 않는다(availability API 400 방지).
    await waitFor(() => expect(requestedYearMonths).toContain('2026-08'));
    expect(requestedYearMonths).not.toContain('2026-09');
    // 9/1(화)은 데이터가 없어 비활성이다(조회 범위 밖은 비활성이 정답 — 창⊆당월∪익월 불변식).
    expect(screen.getByRole('button', { name: '화요일 1일' })).toBeDisabled();
  });

  it('(d) 연도 경계 12/29~1/4 주: 익년 1/1·1/2 가 정상 활성이다(월 산술 연도 넘김)', async () => {
    pinSeoulNoon('2026-12-20'); // day>15 → 창 [12/16 .. 익년 1/15]
    const requestedYearMonths = installCarryoverHandlers('2026-12-16', '2027-01-15');
    mockSearchParams.value = 'facilityId=1&date=2026-12-31'; // 조회 월=12월, 주는 익년 1월로 이월

    renderPage();

    await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf('2026-12-31')) });

    // 익년 1월 데이터 병합 → 1/1(금)·1/2(토) 활성.
    await waitFor(() => expect(screen.getByRole('button', { name: '금요일 1일' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '토요일 2일' })).toBeEnabled();
    await waitFor(() => expect(requestedYearMonths).toContain('2027-01'));
  });
});
