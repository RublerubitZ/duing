import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { JoinRequestSummary } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import JoinRequestsPage from '@/app/manage/clubs/[clubId]/members/requests/page';

const CLUB_ID = 7;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

function request(overrides: Partial<JoinRequestSummary> = {}): JoinRequestSummary {
  return {
    joinRequestId: 1,
    userName: '홍길동',
    studentId: '20200001',
    major: '컴퓨터공학과',
    code: 'ABCD1234',
    generation: 12,
    status: 'PENDING',
    requestedAt: '2026-08-01T02:00:00Z',
    ...overrides,
  };
}

const pendingFixture: JoinRequestSummary[] = [
  request({ joinRequestId: 1, userName: '홍길동', studentId: '20200001', major: '컴퓨터공학과' }),
  request({ joinRequestId: 2, userName: '김철수', studentId: '20200002', major: '경영학과' }),
];

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  mockAddToast.mockClear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다(members 페이지 테스트 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <JoinRequestsPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('가입 요청 페이지 — 목록', () => {
  it('대기 중 요청의 이름·학번·학과·코드·기수·요청일을 보여준다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(pendingFixture)));
    renderPage();

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('20200001')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터공학과')).toBeInTheDocument();
    expect(screen.getAllByText('ABCD1234').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12기').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026.08.01').length).toBeGreaterThan(0);
  });

  it('요청이 없으면 빈 상태를 안내한다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json([])));
    renderPage();

    expect(await screen.findByText('대기 중인 가입 요청이 없어요')).toBeInTheDocument();
  });

  it('상태 칩을 바꾸면 그 상태로 다시 조회한다', async () => {
    const requestedStatuses: (string | null)[] = [];
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, ({ request: httpRequest }) => {
        const status = new URL(httpRequest.url).searchParams.get('status');
        requestedStatuses.push(status);
        return json(status === 'PENDING' ? pendingFixture : []);
      }),
    );
    renderPage();

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(requestedStatuses[0]).toBe('PENDING');

    await userEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => expect(requestedStatuses).toContain('APPROVED'));
  });
});

describe('가입 요청 페이지 — 상세와 단건 처리', () => {
  it('상세를 열면 전화번호가 노출되고 승인하면 목록이 갱신된다', async () => {
    let remaining = [...pendingFixture];
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(remaining)),
      http.get(`*/clubs/${CLUB_ID}/join-requests/1`, () =>
        json({ ...pendingFixture[0], phone: '010-1234-5678', rejectReason: null, reviewedAt: null }),
      ),
      http.patch(`*/clubs/${CLUB_ID}/join-requests/1`, () => {
        remaining = remaining.filter((each) => each.joinRequestId !== 1);
        return json({ result: 'APPROVED' });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '홍길동 상세' }));

    const panel = await screen.findByRole('complementary', { name: '홍길동 상세' });
    expect(within(panel).getByText('010-1234-5678')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: '승인' }));

    await waitFor(() => expect(screen.queryByText('홍길동')).not.toBeInTheDocument());
    expect(mockAddToast).toHaveBeenCalledWith('가입 요청을 승인했습니다.');
  });

  it('이미 가입된 회원이라 자동 거절되면 그 사실을 구분해 안내한다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(pendingFixture)),
      http.get(`*/clubs/${CLUB_ID}/join-requests/1`, () =>
        json({ ...pendingFixture[0], phone: '010-1234-5678', rejectReason: null, reviewedAt: null }),
      ),
      http.patch(`*/clubs/${CLUB_ID}/join-requests/1`, () => json({ result: 'AUTO_REJECTED' })),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '홍길동 상세' }));
    const panel = await screen.findByRole('complementary', { name: '홍길동 상세' });
    await userEvent.click(within(panel).getByRole('button', { name: '승인' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('이미 가입된 회원이라 자동 거절 처리되었습니다.'),
    );
  });

  it('처리에 실패하면 상세 패널 안에 서버 메시지를 그대로 보여준다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(pendingFixture)),
      http.get(`*/clubs/${CLUB_ID}/join-requests/1`, () =>
        json({ ...pendingFixture[0], phone: '010-1234-5678', rejectReason: null, reviewedAt: null }),
      ),
      http.patch(`*/clubs/${CLUB_ID}/join-requests/1`, () =>
        HttpResponse.json(
          { ok: false, message: '남은 인원이 부족합니다.', data: null },
          { status: 409 },
        ),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '홍길동 상세' }));
    const panel = await screen.findByRole('complementary', { name: '홍길동 상세' });
    await userEvent.click(within(panel).getByRole('button', { name: '승인' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent('남은 인원이 부족합니다.');
  });
});

describe('가입 요청 페이지 — 일괄 승인', () => {
  it('선택한 요청을 일괄 승인하고 실패가 있으면 결과 다이얼로그로 사유를 보여준다', async () => {
    let bulkBody: unknown = null;
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(pendingFixture)),
      http.patch(`*/clubs/${CLUB_ID}/join-requests/bulk-approve`, async ({ request: httpRequest }) => {
        bulkBody = await httpRequest.json();
        return json({
          approvedCount: 1,
          failures: [{ joinRequestId: 2, reason: '남은 인원이 부족합니다.' }],
        });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('checkbox', { name: '홍길동 선택' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '김철수 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '선택 2건 일괄 승인' }));

    const resultDialog = await screen.findByRole('dialog');
    expect(within(resultDialog).getByText(/1건.*승인/)).toBeInTheDocument();
    expect(within(resultDialog).getByText(/남은 인원이 부족합니다\./)).toBeInTheDocument();
    expect(bulkBody).toEqual({ joinRequestIds: [1, 2] });
  });

  it('전부 성공하면 결과 다이얼로그 없이 토스트로 끝낸다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, () => json(pendingFixture)),
      http.patch(`*/clubs/${CLUB_ID}/join-requests/bulk-approve`, () =>
        json({ approvedCount: 2, failures: [] }),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('checkbox', { name: '홍길동 선택' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '김철수 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '선택 2건 일괄 승인' }));

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('2건을 승인했습니다.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('대기 중이 아닌 상태에서는 선택·일괄 승인 UI 가 없다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-requests`, ({ request: httpRequest }) => {
        const status = new URL(httpRequest.url).searchParams.get('status');
        return json(status === 'PENDING' ? pendingFixture : [request({ status: 'APPROVED' })]);
      }),
    );
    renderPage();

    expect(await screen.findByRole('checkbox', { name: '홍길동 선택' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: '홍길동 선택' })).not.toBeInTheDocument(),
    );
  });
});
