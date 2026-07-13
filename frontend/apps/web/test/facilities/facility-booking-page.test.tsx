import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
import { seoulDateIso, shiftYearMonth, yearMonthLabel } from '@/app/facilities/_lib/facilityTimeline';
import { FacilityBookingPage } from '@/app/facilities/_pages/FacilityBookingPage';

// 딥링크는 각 시나리오가 mockSearchParams.value 로 제어한다(홈 뷰는 빈 문자열, 캘린더 뷰는 facilityId=1).
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

// 창 첫날 셀(혼합 슬롯 → availableSlotCount 10 → 레벨 '여유'). 접근성 이름 정확 매칭으로
// 월 폴백 전환기의 PAST/창밖 셀("N일"·"N일 예약 기간 아님")과 혼선을 차단한다.
const WINDOW_FROM_CELL = `${WINDOW_FROM_DAY}일 여유`;

// 창 월 안에 있으면서 창 밖(미래) 셀 — 토스트 가드 검증용.
// day<=15(창=16~말일)면 창 열기 직전 날(15일), day>15(창=익월1~15)면 창 닫힌 뒤 날(익월16일).
const OUT_OF_WINDOW_DATE = WINDOW_FROM_DAY === 16 ? `${WINDOW_MONTH}-15` : `${WINDOW_MONTH}-16`;
const OUT_OF_WINDOW_CELL = `${Number(OUT_OF_WINDOW_DATE.slice(8, 10))}일 예약 기간 아님`;

// windowRangeLabel 미러(M.d ~ M.d) — 배지("예약 가능 기간 …")·토스트("… (…)") 문구 단언용.
const labelPart = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const WINDOW_LABEL = `${labelPart(WINDOW.from)} ~ ${labelPart(WINDOW.until)}`;

// 창 첫날 셀에 배치할 13칸: 11시=SCHOOL(비호응원단), 12시=INTERNAL(예약됨), 14시=HOLD, 나머지 AVAILABLE
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

// availability 는 요청 yearMonth 의 한 달 전체를 채운다. 창 밖 날짜도 데이터상 AVAILABLE 이며(게이팅은
// 페이지가 bookableFrom/Until 로 수행), 창 첫날에만 혼합 슬롯을 둔다. bookableFrom/Until 은 항상 반월 창.
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
      if (iso === WINDOW.from) {
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

// availability 핸들러는 요청 yearMonth 를 읽어 해당 월 응답을 준다(기본 월=창 월 검증·클램프 시나리오와 정합).
function availabilityHandlerFor(facilityId: number) {
  return http.get(`*/facilities/${facilityId}/availability`, ({ request }) => {
    const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? WINDOW_MONTH;
    return ok(makeAvailability(facilityId, yearMonth));
  });
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
  http.get('*/facilities/booking-window', () => ok({ bookableFrom: WINDOW.from, bookableUntil: WINDOW.until })),
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
  // 자동 첫 시설 선택이 없어 미선택 시 홈 뷰(카드 그리드)가 뜬다 — 대부분의 시나리오는 캘린더 뷰
  // (슬롯/폼 플로우)를 검증하므로 딥링크로 시설을 선택한 상태로 진입시킨다. 홈 뷰가 필요한 시나리오는
  // 각자 mockSearchParams.value 를 비운다.
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

describe('FacilityBookingPage — 예약 홈 통합(반월 창)', () => {
  it('시나리오 1: 홈 뷰는 시설 카드·예약 가능 기간 배지를 렌더하고, 카드 클릭 시 창 월 캘린더로 전환한다', async () => {
    mockSearchParams.value = ''; // 딥링크 없음 → 홈 뷰
    renderPage();

    // 홈 헤더·창 배지·카드 2개(둘 다 "날짜 보기 →"). 배지 라벨과 범위(M.d ~ M.d)는 중첩 span 으로
    // 나뉘어 있어 라벨 텍스트와 창 범위를 각각 단언한다(홈 배지 + 카드 배지에 범위가 함께 노출).
    expect(await screen.findByText('예약할 시설을 골라보세요')).toBeInTheDocument();
    expect(screen.getByText('예약 가능 기간')).toBeInTheDocument();
    expect(screen.getAllByText(WINDOW_LABEL).length).toBeGreaterThan(0);
    expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);

    // 커뮤니티룸 카드 클릭(카드 버튼 접근성 이름 = 시설명 … 날짜 보기 — 타임라인의 "N 선택" 버튼과 구분).
    fireEvent.click(screen.getByRole('button', { name: /커뮤니티룸\(1\).*날짜 보기/ }));

    // 캘린더 뷰: h1 + 기본 월=창 월 캘린더 제목.
    expect(await screen.findByRole('heading', { level: 1, name: '커뮤니티룸(1) 예약' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) })).toBeInTheDocument();
  });

  it('시나리오 2: 딥링크 facilityId=1 은 캘린더로 직행하고 콘텍스트 바·창 첫날 셀 레벨을 노출한다', async () => {
    renderPage();

    // 선택 시설(커뮤니티룸)은 콘텍스트 바 버튼, 다른 시설(공동연습실)은 퀵 칩으로 노출된다.
    expect(await screen.findByRole('button', { name: '커뮤니티룸(1) — 다른 시설 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공동연습실(1)' })).toBeInTheDocument();

    // 창 첫날 셀은 availableSlotCount 10 → 레벨 '여유'.
    const windowFromCell = await screen.findByRole('button', { name: WINDOW_FROM_CELL });
    expect(windowFromCell).toHaveTextContent('여유');
  });

  it('시나리오 3: 창 첫날 셀 선택 시 슬롯 상태·운영 안내·요약 카드 분포 패널이 열린다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));

    expect(await screen.findByText('비호응원단')).toBeInTheDocument(); // SCHOOL 단체명
    expect(screen.getByText('예약됨')).toBeInTheDocument(); // INTERNAL 비노출
    expect(screen.getByText('승인 대기중')).toBeInTheDocument(); // PENDING_HOLD
    expect(screen.getByText(/운영: 고정관념 09:00~20:00/)).toBeInTheDocument();

    // 요약 카드 시간대 분포(오전 09–12 = AVAILABLE 2/3, 오후 12–18 = 4/6, 저녁 18–22 = 4/4).
    expect(screen.getByText('오전')).toBeInTheDocument();
    expect(screen.getByText('오후')).toBeInTheDocument();
    expect(screen.getByText('저녁')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });

  it('시나리오 4: 연속 슬롯 선택 시 병합 범위 CTA 가 활성화된다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));

    expect(screen.getByRole('button', { name: '18:00~20:00 예약 신청' })).toBeEnabled();
  });

  it('시나리오 5: 로그인 신청이 성공하면 정확한 payload 전송·승인 타임라인 노출 후 "다른 시설 예약하기"로 홈에 복귀한다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    let capturedBody: unknown = null;
    server.use(
      http.post('*/clubs/7/facility-bookings', async ({ request }) => {
        capturedBody = await request.json();
        return ok({ bookingId: 31, status: 'PENDING' as const, overlappingPendingCount: 1 });
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: /19:00~20:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~20:00 예약 신청' }));

    // 폼 단계에서도 스텝 인디케이터가 노출되고 '신청 확인'(2단계)이 활성으로 표시된다(§2.5).
    // 이 라벨은 스텝 인디케이터 전용 — 성공 타임라인은 "승인 진행 타임라인"으로 분리돼 여기 잡히지 않는다.
    fireEvent.click(await screen.findByRole('button', { name: '정기 합주' }));
    expect(screen.getAllByLabelText('예약 진행 단계').length).toBeGreaterThan(0);
    expect(screen.getByText('신청 확인')).toBeInTheDocument();

    // 폼: Preset 칩 탭 → 목적 input 이 채워진다.
    expect(screen.getByRole('textbox', { name: '사용 목적' })).toHaveValue('정기 합주');

    // 운영진 동아리 목록 로드 대기 — canSubmit 이 clubId 확보 후에만 true 라 클릭 no-op 플레이크 방지.
    await screen.findByText('밴드부');
    fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));

    // 성공 화면: 세로 승인 타임라인(관리자 승인 대기 단계) + 겹침 경고. 타임라인엔 '보통' 같은 우선순위 문구가 없다.
    const timeline = await screen.findByLabelText('승인 진행 타임라인');
    expect(within(timeline).getByText('관리자 승인 대기')).toBeInTheDocument();
    expect(within(timeline).queryByText('보통')).not.toBeInTheDocument();
    expect(screen.getByText(/1건이 함께 대기/)).toBeInTheDocument();

    await waitFor(() => expect(capturedBody).not.toBeNull());
    // attendeeCount 는 미입력이므로 body 에 키 자체가 없어야 한다(toEqual 전체 비교로 보장). date 는 창 첫날.
    expect(capturedBody).toEqual({
      facilityId: 1,
      date: WINDOW.from,
      startTime: '18:00',
      endTime: '20:00',
      purpose: '정기 합주',
    });

    // "다른 시설 예약하기" → 홈 뷰 복귀(홈 카드 재노출로 확인).
    fireEvent.click(screen.getByRole('button', { name: '다른 시설 예약하기' }));
    expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);
  });

  it('시나리오 6: 창 밖 미래 셀을 탭하면 선택은 열리지 않고 기간이 담긴 토스트로 안내한다', async () => {
    renderPage();

    // 월 폴백→창 월 전환(제목 정착)과 창 로딩(배지)을 모두 기다린 뒤 클릭 — 전환기 셀 혼선·라벨 누락 방지.
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) });
    await screen.findByText(`예약 가능 기간 ${WINDOW_LABEL}`);

    fireEvent.click(screen.getByRole('button', { name: OUT_OF_WINDOW_CELL }));

    expect(
      await screen.findByText(`현재 예약 가능한 기간이 아니에요 (${WINDOW_LABEL})`),
    ).toBeInTheDocument();
    // 안내만 하고 패널(예약 신청 CTA)은 열리지 않는다.
    expect(screen.queryByRole('button', { name: /예약 신청/ })).not.toBeInTheDocument();
  });

  it('시나리오 7: 창 밖 날짜 딥링크는 패널을 열지 않고 스테일 date 를 정리하며 토스트로 안내한다', async () => {
    mockSearchParams.value = `facilityId=1&date=${OUT_OF_WINDOW_DATE}`;
    renderPage();

    // 창 로드 후 out-of-window 이펙트가 selectedDate 를 비우고 토스트를 띄운다(문구엔 기간 포함).
    expect(
      await screen.findByText(`현재 예약 가능한 기간이 아니에요 (${WINDOW_LABEL})`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /예약 신청/ })).not.toBeInTheDocument();
    expect(screen.queryByText('비호응원단')).not.toBeInTheDocument(); // 창 첫날 패널이 아님을 재확인
  });

  it('시나리오 8: PENDING_HOLD 슬롯을 포함하면 폼 상단에 홀드 경고가 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /14:00~15:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '14:00~15:00 예약 신청' }));

    expect(
      await screen.findByText(/이미 예약 신청이 접수된 시간이 포함돼 있어요/),
    ).toBeInTheDocument();
  });

  it('시나리오 9: 비로그인 홈 뷰에서는 내 신청 칩이 뜨지 않고 운영 동아리 조회도 발사되지 않는다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    mockSearchParams.value = ''; // 홈 뷰(딥링크 없음) — MyBookingsChip 은 홈 상단에만 있다.

    // managed 요청 발사 여부를 직접 포착한다(로그인 게이트 enabled:false 로 조회 자체가 안 나가야 함).
    // 어떤 스트레이 요청도 suite 의 onUnhandledRequest:'error' 가 백스톱한다.
    const managedRequests: string[] = [];
    const trackManaged = ({ request }: { request: Request }) => {
      if (request.url.includes('/leader/clubs/me/managed')) managedRequests.push(request.url);
    };
    server.events.on('request:start', trackManaged);

    renderPage();

    // 홈 카드가 뜬 뒤(홈 뷰 렌더 확정) 칩 부재·조회 미발사를 단언한다.
    expect(await screen.findAllByText('날짜 보기 →')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /내 신청/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /내 예약 관리/ })).not.toBeInTheDocument();
    expect(managedRequests).toHaveLength(0);

    server.events.removeListener('request:start', trackManaged);
  });

  it('시나리오 10: 비로그인으로 예약을 진행하면 폼 대신 로그인 링크(복귀 next 포함)가 노출된다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    const loginLink = await screen.findByRole('link', { name: '로그인하기' });
    // 로그인 후 현재 딥링크로 복귀하도록 next 파라미터가 실린다(검증은 로그인 쪽 toLinkRoute).
    expect(loginLink.getAttribute('href')).toMatch(/^\/login\?next=/);
  });

  it('시나리오 11: 로그인 운영진(동아리 1개)에 진행 중 신청이 있으면 관리 목록으로 가는 칩이 뜬다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(http.get('*/clubs/7/facility-bookings', () => ok([PENDING_BOOKING])));
    mockSearchParams.value = ''; // MyBookingsChip 은 홈 뷰(미선택) 상단에 있으므로 딥링크 해제

    renderPage();

    const chipLink = await screen.findByRole('link', { name: /내 신청 1건 진행 중/ });
    expect(chipLink).toHaveAttribute('href', '/manage/clubs/7/facility-bookings');
  });

  it('시나리오 12: 신청이 409 로 실패하면 재조회 후 무효해진 선택을 비우고 슬롯 화면으로 돌아간다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });

    // POST 가 409 를 낸 뒤 onSettled 재조회 시점부터 선택 범위(18:00~19:00)가 BLOCKED 로 바뀌도록
    // 가변 플래그로 availability 응답을 전환한다(핸들러 오염 방지 위해 이 테스트 내부에서만 server.use).
    let conflictBlocked = false;
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? WINDOW_MONTH;
        const availability = makeAvailability(1, yearMonth);
        if (conflictBlocked) {
          const windowFrom = availability.days.find((day) => day.date === WINDOW.from);
          if (windowFrom) {
            windowFrom.slots = windowFrom.slots.map((slot) =>
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

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
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

  it('시나리오 13: 로그인 상태에서 운영진 동아리 조회가 실패하면 폼에 에러·재시도가 노출된다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    // renderPage 의 QueryClient 는 queries.retry:false 라 500 이 즉시 isError 로 떨어진다.
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        HttpResponse.json({ ok: false, data: null, message: '오류' }, { status: 500 }),
      ),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByText('동아리 정보를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('시나리오 14: 지난달 딥링크는 창 월로 클램프해 무효(스테일) 월 availability 요청 없이 캘린더를 렌더한다', async () => {
    // 지난달은 절대날짜 하드코딩 금지 — 당월에서 -1개월 파생(TODAY 기준 동적 계산).
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    mockSearchParams.value = `facilityId=1&date=${lastMonth}-15`;

    // availability 요청의 yearMonth 를 포착해 직접 단언한다. 창 로딩 전 월 폴백으로 당월이 한 번
    // 요청될 수 있으나(창 월과 같거나 이웃 월), 스테일 딥링크 월(지난달)은 절대 요청되지 않고 최종 창 월로 정착한다.
    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth');
        if (yearMonth !== null) requestedYearMonths.push(yearMonth);
        return ok(makeAvailability(1, yearMonth ?? WINDOW_MONTH));
      }),
    );

    renderPage();

    // 캘린더가 창 월 기준으로 정상 렌더된다(창 첫날 셀 노출 = availability 창 월 응답 반영).
    expect(await screen.findByRole('button', { name: WINDOW_FROM_CELL })).toBeInTheDocument();

    // 요청 yearMonth 포착 단언이 직접 보장한다 — 최종 창 월로 정착하고, 지난달(스테일 월)은 요청되지 않는다.
    await waitFor(() => expect(requestedYearMonths).toContain(WINDOW_MONTH));
    expect(requestedYearMonths).not.toContain(lastMonth);
  });
});
