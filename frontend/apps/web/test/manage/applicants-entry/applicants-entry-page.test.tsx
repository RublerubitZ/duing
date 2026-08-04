import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

const mockReplace = vi.fn();
// 렌더마다 새 객체를 돌려주면 useGuardedRouter 의 memo 가 매번 깨져 이동 effect 가 재실행된다 —
// 실제 라우터는 안정 참조라 그런 일이 없으므로 참조를 고정해 둔다.
const routerMock = { push: vi.fn(), replace: mockReplace, back: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

import ClubApplicantsEntryPage from '@/app/manage/clubs/[clubId]/applicants/page';

// 지원현황은 모집 URL 이 아니라 클럽 단위로 진입한다(스펙 §2).
// 이 페이지는 화면이 아니라 라우터 — 진행 중(OPEN·자체 폼) 모집이 있으면 그 지원현황으로 넘기고,
// 없을 때만 Empty State + 마감 아카이브를 직접 렌더한다.

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

type RecruitmentRowOverrides = {
  id: number;
  title?: string;
  startDate?: string;
  endDate?: string | null;
  status?: 'OPEN' | 'CLOSED';
  applicationMode?: 'SELF' | 'EXTERNAL';
  closedAt?: string | null;
};

function recruitmentRow(overrides: RecruitmentRowOverrides) {
  const status = overrides.status ?? 'OPEN';
  return {
    id: overrides.id,
    clubId: CLUB_ID,
    clubName: '두잉',
    title: overrides.title ?? `${overrides.id}기 모집`,
    startDate: overrides.startDate ?? '2026-03-02',
    endDate: overrides.endDate === undefined ? '2026-03-16' : overrides.endDate,
    capacity: 20,
    status,
    displayStatus: status,
    effectivelyOpen: status === 'OPEN',
    applicationMode: overrides.applicationMode ?? 'SELF',
    externalFormUrl: null,
    useInterview: false,
    targetRole: 'MEMBER',
    closedAt: overrides.closedAt ?? null,
  };
}

function recruitmentListHandler(recruitmentRows: unknown[]) {
  return http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
    HttpResponse.json({ ok: true, message: null, data: recruitmentRows }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockReplace.mockReset();
});
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 의 use(thenable) 가 재진입 없이 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (모집 목록 페이지 테스트와 동일 — 일반 Promise 를 넘기면 jsdom 에서 영구 loading 으로 막힌다).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ClubApplicantsEntryPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('지원현황 클럽 단위 진입 — 자동 이동', () => {
  it('진행 중(OPEN·자체 폼) 모집이 있으면 첫 항목의 지원현황으로 replace 한다', async () => {
    server.use(
      recruitmentListHandler([
        recruitmentRow({ id: 12, title: '12기 신입 모집' }),
        recruitmentRow({ id: 11, title: '상시 모집', endDate: null }),
      ]),
    );
    renderPage();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        `/manage/clubs/${CLUB_ID}/recruitments/12/applicants`,
      ),
    );
    expect(mockReplace).toHaveBeenCalledTimes(1);
    // 이동 대기 중에는 Empty State 를 깜빡이지 않는다.
    expect(screen.queryByText('현재 진행 중인 모집이 없습니다.')).not.toBeInTheDocument();
  });

  it('마감일이 지났어도 수동 마감 전(raw OPEN)이면 심사 중으로 보고 이동한다', async () => {
    server.use(
      recruitmentListHandler([
        recruitmentRow({ id: 9, startDate: '2020-03-02', endDate: '2020-03-16' }),
      ]),
    );
    renderPage();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(`/manage/clubs/${CLUB_ID}/recruitments/9/applicants`),
    );
  });
});

describe('지원현황 클럽 단위 진입 — Empty State', () => {
  it('진행 중 모집이 없으면 새 모집 등록 CTA 와 지난 모집 목록을 보인다', async () => {
    server.use(
      recruitmentListHandler([
        recruitmentRow({
          id: 7,
          title: '7기 모집',
          startDate: '2025-03-02',
          endDate: '2025-03-16',
          status: 'CLOSED',
          closedAt: '2025-03-16T09:00:00Z',
        }),
        recruitmentRow({
          id: 8,
          title: '8기 모집',
          startDate: '2025-09-01',
          endDate: '2025-09-15',
          status: 'CLOSED',
          closedAt: '2025-09-15T09:00:00Z',
        }),
        // 외부 폼 마감 모집은 지원자 관리 대상이 아니므로 아카이브에서 제외한다.
        recruitmentRow({
          id: 6,
          title: '외부 폼 모집',
          status: 'CLOSED',
          applicationMode: 'EXTERNAL',
        }),
      ]),
    );
    renderPage();

    expect(await screen.findByText('현재 진행 중인 모집이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('새 모집을 등록해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새 모집 등록' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/new`,
    );
    expect(mockReplace).not.toHaveBeenCalled();

    // 종료 시점 내림차순 — 8기(2025-09-15)가 7기(2025-03-16)보다 앞.
    const applicantLinks = screen.getAllByRole('link', { name: '지원자 보기' });
    expect(applicantLinks.map((link) => link.getAttribute('href'))).toEqual([
      `/manage/clubs/${CLUB_ID}/recruitments/8/applicants`,
      `/manage/clubs/${CLUB_ID}/recruitments/7/applicants`,
    ]);
    expect(screen.getByText('8기 모집')).toBeInTheDocument();
    expect(screen.getByText(/2025-09-01 ~ 2025-09-15/)).toBeInTheDocument();
    expect(screen.getByText(/마감 2025-09-15/)).toBeInTheDocument();
    expect(screen.queryByText('외부 폼 모집')).not.toBeInTheDocument();
  });

  it('진행 중 모집이 외부 폼뿐이면 전용 안내와 모집 관리 CTA 를 보인다', async () => {
    server.use(
      recruitmentListHandler([
        recruitmentRow({ id: 20, title: '외부 폼 모집', applicationMode: 'EXTERNAL' }),
      ]),
    );
    renderPage();

    expect(
      await screen.findByText('진행 중인 모집이 외부 폼으로 운영되고 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('외부 폼 모집은 지원자 관리를 사용하지 않아요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '모집 관리로 이동' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments`,
    );
    expect(screen.queryByRole('link', { name: '새 모집 등록' })).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('지원현황 클럽 단위 진입 — 로딩·에러', () => {
  it('모집 목록을 불러오는 동안에는 로딩 게이트를 보인다', async () => {
    server.use(recruitmentListHandler([]));
    renderPage();

    expect(screen.getByRole('status', { name: '모집 목록 불러오는 중' })).toBeInTheDocument();
    expect(await screen.findByText('현재 진행 중인 모집이 없습니다.')).toBeInTheDocument();
  });

  // 조회 실패를 Empty State 로 떨어뜨리면 장애 중에 "새 모집을 등록해 주세요" 로 오인시킨다(스펙 §2-4).
  it('모집 목록 조회가 실패하면 Empty State 대신 에러 안내와 재시도를 보인다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
        HttpResponse.json({ ok: false, message: 'error', data: null }, { status: 500 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('모집 목록을 불러오지 못했어요');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.queryByText('현재 진행 중인 모집이 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '새 모집 등록' })).not.toBeInTheDocument();
  });
});
