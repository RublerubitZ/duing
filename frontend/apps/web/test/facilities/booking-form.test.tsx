import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, facilityQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { FacilityBookingSummary, User } from '@duing/types';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { BookingForm } from '@/app/facilities/_components/booking/BookingForm';

// BookingForm 은 next/navigation 을 쓰지 않는다(next/link 만) — 라우터 모킹 불필요(플랜 리뷰 확인).
function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, data, message: null });
}

const AUTH_USER: User = {
  id: 1,
  studentId: '20200001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'JUNIOR',
  role: 'STUDENT',
};
const CLUB_ID = 7;
// 마감 게이트(사용일 전날 12:00 KST)를 항상 통과하도록 now 를 고정하고 사용일은 오늘+2 로 둔다.
const FIXED_NOW = new Date('2026-07-31T12:30:00+09:00');
const DATE_ISO = '2026-08-02';
const OWN_DUPLICATE_MESSAGE =
  '이 시간에 이미 접수·승인된 우리 동아리 신청이 있어 중복 신청은 거부돼요. 기존 신청을 취소한 뒤 다시 신청해주세요.';
const PENDING_HOLD_MESSAGE = '이미 예약 신청이 접수된 시간이 포함돼 있어요. 계속 신청할 수 있지만, 승인은 한 신청에만 됩니다.';

// 케이스마다 비우고 채우는 자기 동아리 예약 목록(MSW 핸들러가 참조).
const clubBookings: FacilityBookingSummary[] = [];
const server = setupServer(
  http.get('*/leader/clubs/me/managed', () =>
    ok([{ clubId: CLUB_ID, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 0 }]),
  ),
  http.get('*/facilities/booking-purpose-presets', () => ok([{ id: 1, label: '동아리 정기 모임' }])),
  http.get(`*/clubs/${CLUB_ID}/facility-bookings`, () => ok(clubBookings)),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: FIXED_NOW });
  useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
  clubBookings.length = 0;
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterAll(() => server.close());

function makeBooking(overrides: Partial<FacilityBookingSummary>): FacilityBookingSummary {
  return {
    bookingId: 1,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: DATE_ISO,
    // 목록 API 는 BE LocalTime 기본 직렬화라 시각이 HH:mm:ss 로 온다 — 픽스처도 실제 계약을 따른다.
    startTime: '18:00:00',
    endTime: '19:00:00',
    status: 'PENDING',
    purpose: '정기 합주',
    createdAt: '2026-07-30T10:00:00',
    ...overrides,
  };
}

function renderForm(hasPendingHold: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
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
      <BookingForm
        facilityId={1}
        facilityName="커뮤니티룸(1)"
        date={DATE_ISO}
        range={{ start: '18:00', end: '20:00' }}
        hasPendingHold={hasPendingHold}
        onSubmitted={vi.fn()}
        onBack={vi.fn()}
      />
    </Wrapper>,
  );
  // 부정 단언(경고 없음)은 목록 응답이 도착한 뒤에만 의미가 있다 — 쿼리 성공 상태를 기다리는 헬퍼.
  const waitForClubBookings = () =>
    waitFor(() => expect(queryClient.getQueryState(facilityQueryKeys.clubBookings(CLUB_ID))?.status).toBe('success'));
  return { waitForClubBookings };
}

describe('BookingForm — 자기 동아리 중복 사전 경고(P2-19)', () => {
  it('같은 날 시간이 겹치는 자기 동아리 PENDING 이 있으면 "계속 신청 가능" 대신 거부 경고를 보여준다', async () => {
    clubBookings.push(makeBooking({ startTime: '19:00:00', endTime: '21:00:00' })); // 18~20 신청과 19~20 겹침
    renderForm(true);

    expect(await screen.findByText(OWN_DUPLICATE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_HOLD_MESSAGE)).not.toBeInTheDocument();
  });

  it('다른 시설의 APPROVED 겹침도 BE 규칙(시설 무관)대로 경고한다 — PENDING_HOLD 표시가 없어도', async () => {
    clubBookings.push(makeBooking({ facilityId: 2, roomName: '공동연습실(3)', status: 'APPROVED' }));
    renderForm(false);

    expect(await screen.findByText(OWN_DUPLICATE_MESSAGE)).toBeInTheDocument();
  });

  it('겹치지 않으면(다른 날·끝==시작 인접) 기존 PENDING_HOLD 안내를 유지한다', async () => {
    clubBookings.push(
      makeBooking({ date: '2026-08-03' }),
      makeBooking({ bookingId: 2, startTime: '16:00:00', endTime: '18:00:00' }), // endTime(HH:mm:ss) === range.start("18:00") 는 비겹침
    );
    const { waitForClubBookings } = renderForm(true);

    expect(await screen.findByText(PENDING_HOLD_MESSAGE)).toBeInTheDocument();
    await waitForClubBookings();
    expect(screen.queryByText(OWN_DUPLICATE_MESSAGE)).not.toBeInTheDocument();
  });

  it('CANCELLED·REJECTED 는 무시한다', async () => {
    clubBookings.push(makeBooking({ status: 'CANCELLED' }), makeBooking({ bookingId: 2, status: 'REJECTED' }));
    const { waitForClubBookings } = renderForm(false);

    await waitForClubBookings();
    expect(screen.queryByText(OWN_DUPLICATE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
