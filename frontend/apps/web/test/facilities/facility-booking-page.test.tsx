import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
import { seoulDateIso, shiftYearMonth } from '@/app/facilities/_lib/facilityTimeline';
import { FacilityBookingPage } from '@/app/facilities/_pages/FacilityBookingPage';

// URL 딥링크는 이 스위트에서 쓰지 않으므로 항상 빈 검색 문자열을 반환한다.
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

// 날짜는 전부 오늘 기준으로 동적 생성한다(하드코딩 절대날짜 = CI 타임밤 금지).
const TODAY_ISO = seoulDateIso(new Date());
const CURRENT_MONTH = TODAY_ISO.slice(0, 7);
// 캘린더 셀 접근성 이름은 이제 레벨 라벨을 포함한다(예: "14일 여유") — 날짜 접두로 매칭한다.
const TODAY_DAY_LABEL = new RegExp(`^${Number(TODAY_ISO.slice(8, 10))}일`);

const pad2 = (value: number) => String(value).padStart(2, '0');

// booking-window 핸들러·availability 픽스처가 공유하는 당월 말일(bookableUntil).
const [currentYear, currentMonthNumber] = CURRENT_MONTH.split('-').map(Number);
const BOOKABLE_UNTIL = `${CURRENT_MONTH}-${pad2(new Date(currentYear ?? 1970, currentMonthNumber ?? 1, 0).getDate())}`;

// 오늘 셀에 배치할 13칸: 11시=SCHOOL(비호응원단), 12시=INTERNAL(예약됨), 14시=HOLD, 나머지 AVAILABLE
function makeMixedSlots(): BookingAvailabilitySlot[] {
  return Array.from({ length: 13 }, (_, index) => {
    const start = `${pad2(9 + index)}:00`;
    const end = `${pad2(10 + index)}:00`;
    if (index === 2)
      return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '비호응원단' };
    if (index === 3) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
    if (index === 5) return { start, end, status: 'PENDING_HOLD' as const };
    return { start, end, status: 'AVAILABLE' as const };
  });
}

function makeAvailability(facilityId: number): FacilityAvailabilityResponse {
  const [year, month] = CURRENT_MONTH.split('-').map(Number);
  const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate();
  return {
    facilityId,
    yearMonth: CURRENT_MONTH,
    lastUpdatedAt: null,
    stale: false,
    bookableFrom: TODAY_ISO,
    bookableUntil: `${CURRENT_MONTH}-${pad2(daysInMonth)}`, // 테스트는 당월만 사용
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const iso = `${CURRENT_MONTH}-${pad2(index + 1)}`;
      if (iso < TODAY_ISO) {
        return { date: iso, dayStatus: 'PAST' as const, availableSlotCount: 0, operatingNotes: [], slots: [] };
      }
      if (iso === TODAY_ISO) {
        return {
          date: iso,
          dayStatus: 'AVAILABLE' as const,
          availableSlotCount: 10,
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

// FacilityOverviewTimeline(오늘 이용 현황 details)이 usage 응답으로 마운트되므로
// FacilityItem 전체 필드를 채워야 런타임 크래시가 없다(reservations 등).
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
  date: TODAY_ISO,
  startTime: '18:00',
  endTime: '19:00',
  status: 'PENDING',
  purpose: '정기 합주',
  createdAt: `${TODAY_ISO}T18:00:00`,
};

const server = setupServer(
  http.get('*/facilities/usage', () =>
    ok({ yearMonth: CURRENT_MONTH, lastUpdatedAt: null, stale: false, source: 'CACHE', facilities: [FACILITY_A, FACILITY_B] }),
  ),
  http.get('*/facilities/1/availability', () => ok(makeAvailability(1))),
  // 페이지가 useBookingWindowQuery 를 무조건 마운트하므로 기본 핸들러 필요(onUnhandledRequest:'error' 대비).
  http.get('*/facilities/booking-window', () => ok({ bookableFrom: TODAY_ISO, bookableUntil: BOOKABLE_UNTIL })),
  http.get('*/facilities/booking-purpose-presets', () =>
    ok([{ id: 1, label: '동아리 정기 모임' }, { id: 3, label: '정기 합주' }]),
  ),
  http.get('*/leader/clubs/me/managed', () =>
    ok([{ clubId: 7, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 0 }]),
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
  // jsdom 은 window.matchMedia 가 없다 — useIsMobileViewport(useSyncExternalStore)용 stub.
  // matches:false = 데스크탑 경로(인라인 aside 패널). 구독은 no-op 리스너로 충분하다.
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
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.setState({ status: 'idle', user: null });
  // 자동 첫 시설 선택이 제거돼 미선택 시 홈 뷰(카드 그리드)가 뜬다 — 대부분의 시나리오는 캘린더
  // 뷰(슬롯/폼 플로우)를 검증하므로 딥링크로 시설을 선택한 상태로 진입시킨다. 홈 뷰가 필요한
  // 시나리오(예: MyBookingsChip)는 각자 mockSearchParams.value 를 비운다. 전면 개편은 Task 6.
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

  return render(
    <Wrapper>
      <FacilityBookingPage />
    </Wrapper>,
  );
}

describe('FacilityBookingPage — 예약 홈 통합', () => {
  it('시나리오 1: 콘텍스트 바(선택 시설·다른 시설)와 오늘 셀의 레벨 라벨을 렌더한다', async () => {
    renderPage();

    // 선택 시설(커뮤니티룸)은 카드 버튼, 다른 시설(공동연습실)은 퀵 칩으로 노출된다.
    expect(await screen.findByRole('button', { name: '커뮤니티룸(1) — 다른 시설 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공동연습실(1)' })).toBeInTheDocument();

    // 오늘 셀은 availableSlotCount 10 → 레벨 '여유'.
    const todayCell = await screen.findByRole('button', { name: TODAY_DAY_LABEL });
    expect(todayCell).toHaveTextContent('여유');
  });

  it('시나리오 2: 날짜 선택 시 슬롯 상태·운영 안내가 있는 패널이 열린다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));

    expect(await screen.findByText('비호응원단')).toBeInTheDocument(); // SCHOOL 단체명
    expect(screen.getByText('예약됨')).toBeInTheDocument(); // INTERNAL 비노출
    expect(screen.getByText('승인 대기중')).toBeInTheDocument(); // PENDING_HOLD
    expect(screen.getByText(/운영: 고정관념 09:00~20:00/)).toBeInTheDocument();
  });

  it('시나리오 3: 연속 슬롯 선택 시 병합 범위 CTA 가 활성화된다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));

    expect(screen.getByRole('button', { name: '18:00~20:00 예약 신청' })).toBeEnabled();
  });

  it('시나리오 4: 로그인 상태에서 신청 플로우가 성공하고 정확한 payload 를 전송한다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    let capturedBody: unknown = null;
    server.use(
      http.post('*/clubs/7/facility-bookings', async ({ request }) => {
        capturedBody = await request.json();
        return ok({ bookingId: 31, status: 'PENDING' as const, overlappingPendingCount: 1 });
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~20:00 예약 신청' }));

    // 폼: Preset 칩 탭 → 목적 input 이 채워진다.
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    expect(screen.getByRole('textbox', { name: '사용 목적' })).toHaveValue('정기 합주');

    // 운영진 동아리 목록 로드 대기 — canSubmit 이 clubId 확보 후에만 true 라 클릭 no-op 플레이크 방지.
    await screen.findByText('밴드부');
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));

    // 성공 화면: 진행 스텝 + 겹침 경고.
    expect(await screen.findByText('총동연 승인')).toBeInTheDocument();
    expect(screen.getByText(/1건이 함께 대기/)).toBeInTheDocument();

    await waitFor(() => expect(capturedBody).not.toBeNull());
    // attendeeCount 는 미입력이므로 body 에 키 자체가 없어야 한다(toEqual 전체 비교로 보장).
    expect(capturedBody).toEqual({
      facilityId: 1,
      date: TODAY_ISO,
      startTime: '18:00',
      endTime: '20:00',
      purpose: '정기 합주',
    });
  });

  it('시나리오 5: PENDING_HOLD 슬롯을 포함하면 폼 상단에 홀드 경고가 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /14:00~15:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '14:00~15:00 예약 신청' }));

    expect(
      await screen.findByText(/이미 예약 신청이 접수된 시간이 포함돼 있어요/),
    ).toBeInTheDocument();
  });

  it('시나리오 6: 비로그인 상태에서는 폼 대신 로그인 링크가 노출된다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    const loginLink = await screen.findByRole('link', { name: '로그인하기' });
    // 로그인 후 현재 딥링크로 복귀하도록 next 파라미터가 실린다(검증은 로그인 쪽 toLinkRoute).
    expect(loginLink.getAttribute('href')).toMatch(/^\/login\?next=/);
    // 비로그인에서는 진행 중 신청 칩이 뜨지 않는다(enabled 게이트로 조회 자체가 안 나감).
    expect(screen.queryByRole('link', { name: /내 신청/ })).not.toBeInTheDocument();
  });

  it('시나리오 7: 로그인 상태에서 운영진 동아리 조회가 실패하면 폼에 에러·재시도가 노출된다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    // renderPage 의 QueryClient 는 queries.retry:false 라 500 이 즉시 isError 로 떨어진다.
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        HttpResponse.json({ ok: false, data: null, message: '오류' }, { status: 500 }),
      ),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByText('동아리 정보를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('시나리오 8: 신청이 409 로 실패하면 재조회 후 무효해진 선택을 비우고 슬롯 화면으로 돌아간다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });

    // POST 가 409 를 낸 뒤 onSettled 재조회 시점부터 선택 범위(18:00~19:00)가 BLOCKED 로 바뀌도록
    // 가변 플래그로 availability 응답을 전환한다(핸들러 오염 방지 위해 이 테스트 내부에서만 server.use).
    let conflictBlocked = false;
    server.use(
      http.get('*/facilities/1/availability', () => {
        const availability = makeAvailability(1);
        if (conflictBlocked) {
          const today = availability.days.find((day) => day.date === TODAY_ISO);
          if (today) {
            today.slots = today.slots.map((slot) =>
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

    fireEvent.click(await screen.findByRole('button', { name: TODAY_DAY_LABEL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    await screen.findByText('밴드부');
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));

    // 경합 에러 토스트 + 재조회 후 슬롯 화면 복귀(선택 초기화 → CTA 비활성).
    expect(await screen.findByText('이미 예약된 시간이에요.')).toBeInTheDocument();
    const disabledCta = await screen.findByRole('button', { name: '시간을 선택해주세요' });
    expect(disabledCta).toBeDisabled();
  });

  it('시나리오 9: 로그인 운영진(동아리 1개)에 진행 중 신청이 있으면 관리 목록으로 가는 칩이 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(http.get('*/clubs/7/facility-bookings', () => ok([PENDING_BOOKING])));
    mockSearchParams.value = ''; // MyBookingsChip 은 홈 뷰(미선택) 상단에 있으므로 딥링크 해제

    renderPage();

    const chipLink = await screen.findByRole('link', { name: /내 신청 1건 진행 중/ });
    expect(chipLink).toHaveAttribute('href', '/manage/clubs/7/facility-bookings');
  });

  it('시나리오 10: 지난달 딥링크는 창 월(당월)로 클램프해 무효 월 availability 요청 없이 캘린더를 렌더한다', async () => {
    // 지난달은 절대날짜 하드코딩 금지 — 당월에서 -1개월 파생(TODAY 기준 동적 계산).
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    mockSearchParams.value = `facilityId=1&date=${lastMonth}-15`;

    // availability 요청의 yearMonth 를 포착한다. 지난달(무효 월)이면 절대 나가지 않아야 하고,
    // 400 핸들러를 두지 않은 채 onUnhandledRequest:'error' 로 무효 요청 발생 자체를 간접 차단한다.
    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth');
        if (yearMonth !== null) requestedYearMonths.push(yearMonth);
        return ok(makeAvailability(1));
      }),
    );

    renderPage();

    // 캘린더가 당월 기준으로 정상 렌더된다(오늘 셀 노출 = availability 당월 응답 반영).
    expect(await screen.findByRole('button', { name: TODAY_DAY_LABEL })).toBeInTheDocument();

    // availability 는 오직 당월로만 요청된다 — 지난달(딥링크 스테일 월)은 클램프돼 요청되지 않는다.
    expect(requestedYearMonths.length).toBeGreaterThan(0);
    expect(requestedYearMonths.every((month) => month === CURRENT_MONTH)).toBe(true);
    expect(requestedYearMonths).not.toContain(lastMonth);
  });
});
