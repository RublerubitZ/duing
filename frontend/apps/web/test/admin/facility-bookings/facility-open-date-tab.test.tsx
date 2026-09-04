import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminFacility, UpdateFacilityBookingOpenDatePayload } from '@duing/types';

import { FacilityOpenDateTab } from '@/app/admin/facility-bookings/_tabs/FacilityOpenDateTab';

/* ── 테스트 데이터 ───────────────────────────────────────────
   오픈일 탭은 날짜를 오늘과 비교하지 않고 문자열로만 다룬다(판정은 전부 백엔드) —
   이미 지난 고정 날짜라 CI 시한폭탄이 되지 않는다. */
const CURRENT_OPEN_DATE = '2026-08-01';
const NEXT_OPEN_DATE = '2026-08-20';

const INITIAL_FACILITIES: AdminFacility[] = [
  { id: 10, roomName: '공연장', location: '학생회관 1층', bookingOpenDate: CURRENT_OPEN_DATE },
  { id: 11, roomName: '세미나실', location: null, bookingOpenDate: null },
];

let facilities: AdminFacility[] = [];
let listRequestCount = 0;
const facilityPatches: Array<{ facilityId: number; body: UpdateFacilityBookingOpenDatePayload }> = [];
const bulkPatches: UpdateFacilityBookingOpenDatePayload[] = [];

const server = setupServer(
  http.get('*/admin/facilities', () => {
    listRequestCount += 1;
    return HttpResponse.json({ ok: true, data: facilities, message: null });
  }),
  // 리터럴 경로를 먼저 등록한다 — `:facilityId` 패턴이 'booking-open-date' 를 id 로 삼켜버린다.
  http.patch('*/admin/facilities/booking-open-date', async ({ request }) => {
    const body = (await request.json()) as UpdateFacilityBookingOpenDatePayload;
    bulkPatches.push(body);
    facilities = facilities.map((facility) => ({ ...facility, bookingOpenDate: body.bookingOpenDate }));
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch('*/admin/facilities/:facilityId/booking-open-date', async ({ request, params }) => {
    const body = (await request.json()) as UpdateFacilityBookingOpenDatePayload;
    const facilityId = Number(params.facilityId);
    facilityPatches.push({ facilityId, body });
    facilities = facilities.map((facility) =>
      facility.id === facilityId ? { ...facility, bookingOpenDate: body.bookingOpenDate } : facility,
    );
    return new HttpResponse(null, { status: 204 });
  }),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  facilities = INITIAL_FACILITIES.map((facility) => ({ ...facility }));
  listRequestCount = 0;
  facilityPatches.length = 0;
  bulkPatches.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  }
  return render(<FacilityOpenDateTab />, { wrapper: Providers });
}

async function confirmDialog() {
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: '확인' }));
}

describe('FacilityOpenDateTab', () => {
  it('활성 시설 목록에 현재 오픈일을 보여주고, 오픈일이 없는 시설은 "닫힘"으로 표시한다', async () => {
    renderTab();

    expect(await screen.findByText('공연장')).toBeInTheDocument();
    expect(screen.getByText('학생회관 1층')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: CURRENT_OPEN_DATE })).toBeInTheDocument();
    expect(screen.getByText('세미나실')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '닫힘' })).toBeInTheDocument();
  });

  it('날짜를 바꾸고 저장하면 확인 다이얼로그를 거쳐 그 시설만 PATCH 한다', async () => {
    renderTab();
    await screen.findByText('공연장');

    fireEvent.change(screen.getByLabelText('공연장 오픈일'), { target: { value: NEXT_OPEN_DATE } });
    await userEvent.click(screen.getByRole('button', { name: '공연장 오픈일 저장' }));

    // 다이얼로그가 이전 → 이후를 명시한다
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('공연장')).toBeInTheDocument();
    expect(within(dialog).getByText(CURRENT_OPEN_DATE)).toBeInTheDocument();
    expect(within(dialog).getByText(NEXT_OPEN_DATE)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(facilityPatches).toHaveLength(1));
    expect(facilityPatches[0]).toEqual({ facilityId: 10, body: { bookingOpenDate: NEXT_OPEN_DATE } });
    expect(bulkPatches).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('닫기는 그 시설의 오픈일을 null 로 PATCH 하고, 이미 닫힌 시설에는 닫기 버튼이 없다', async () => {
    renderTab();
    await screen.findByText('공연장');

    expect(screen.queryByRole('button', { name: '세미나실 오픈일 닫기' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '공연장 오픈일 닫기' }));
    await confirmDialog();

    await waitFor(() => expect(facilityPatches).toHaveLength(1));
    expect(facilityPatches[0]).toEqual({ facilityId: 10, body: { bookingOpenDate: null } });
  });

  it('저장 버튼은 입력값이 현재 오픈일과 같으면 비활성이다', async () => {
    renderTab();
    await screen.findByText('공연장');

    expect(screen.getByRole('button', { name: '공연장 오픈일 저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '세미나실 오픈일 저장' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('공연장 오픈일'), { target: { value: NEXT_OPEN_DATE } });
    expect(screen.getByRole('button', { name: '공연장 오픈일 저장' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('공연장 오픈일'), { target: { value: CURRENT_OPEN_DATE } });
    expect(screen.getByRole('button', { name: '공연장 오픈일 저장' })).toBeDisabled();
  });

  it('시설별 저장이 실패하면 다이얼로그를 닫지 않고 서버 사유를 그 안에 보여준다', async () => {
    server.use(
      http.patch('*/admin/facilities/:facilityId/booking-open-date', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '예약 오픈일은 오늘부터 1년 이내여야 합니다.' },
          { status: 400 },
        ),
      ),
    );
    renderTab();
    await screen.findByText('공연장');

    fireEvent.change(screen.getByLabelText('공연장 오픈일'), { target: { value: NEXT_OPEN_DATE } });
    await userEvent.click(screen.getByRole('button', { name: '공연장 오픈일 저장' }));
    await confirmDialog();

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/예약 오픈일은 오늘부터 1년 이내여야 합니다\./),
    ).toBeInTheDocument();
  });

  it('전체 적용은 시설 수와 무관하게 일괄 엔드포인트를 한 번만 호출하고, 성공하면 목록을 다시 불러온다', async () => {
    renderTab();
    await screen.findByText('공연장');
    const listRequestsBeforeApply = listRequestCount;

    fireEvent.change(screen.getByLabelText('전체 적용 오픈일'), { target: { value: NEXT_OPEN_DATE } });
    await userEvent.click(screen.getByRole('button', { name: '모든 시설에 적용' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('활성 시설 2개')).toBeInTheDocument();
    expect(within(dialog).getByText('여러 값')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(bulkPatches).toHaveLength(1));
    expect(bulkPatches[0]).toEqual({ bookingOpenDate: NEXT_OPEN_DATE });
    // 시설별 PATCH 를 대신 순차 호출하지 않는다(부분 적용 금지)
    expect(facilityPatches).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // 무효화로 목록이 재조회되어 두 행 모두 새 오픈일을 보여준다
    await waitFor(() => expect(listRequestCount).toBeGreaterThan(listRequestsBeforeApply));
    await waitFor(() => expect(screen.getAllByRole('cell', { name: NEXT_OPEN_DATE })).toHaveLength(2));
  });

  it('전체 적용이 실패하면 아무 시설도 바뀌지 않았음을 알리고 목록은 그대로 둔다', async () => {
    server.use(
      http.patch('*/admin/facilities/booking-open-date', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '예약 오픈일은 오늘부터 1년 이내여야 합니다.' },
          { status: 400 },
        ),
      ),
    );
    renderTab();
    await screen.findByText('공연장');

    fireEvent.change(screen.getByLabelText('전체 적용 오픈일'), { target: { value: NEXT_OPEN_DATE } });
    await userEvent.click(screen.getByRole('button', { name: '모든 시설에 적용' }));
    await confirmDialog();

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/적용되지 않았어요\. 다시 시도해 주세요\./)).toBeInTheDocument();
    // 목록은 바뀌지 않는다 — 단일 트랜잭션이라 부분 적용이 없다.
    // 다이얼로그가 떠 있는 동안 뒤 화면은 aria-hidden 이라 role 질의로는 잡히지 않는다 — 텍스트로 확인한다.
    expect(screen.getByText(CURRENT_OPEN_DATE)).toBeInTheDocument();
    expect(screen.getByText('닫힘')).toBeInTheDocument();
  });

  it('모든 시설 닫기는 일괄 엔드포인트에 null 을 한 번 보낸다', async () => {
    renderTab();
    await screen.findByText('공연장');

    await userEvent.click(screen.getByRole('button', { name: '모든 시설 닫기' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('닫힘')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(bulkPatches).toHaveLength(1));
    expect(bulkPatches[0]).toEqual({ bookingOpenDate: null });
    expect(facilityPatches).toHaveLength(0);
  });
});
