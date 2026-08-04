import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

import { PastRecruitmentsTable } from '@/app/manage/clubs/[clubId]/recruitments/_components/PastRecruitmentsTable';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function summaryResponse(overrides: Partial<{ total: number; accepted: number }> = {}) {
  return {
    ok: true,
    message: null,
    data: {
      total: 0,
      submitted: 0,
      onHold: 0,
      interviewPending: 0,
      accepted: 0,
      rejected: 0,
      capacity: 18,
      ratio: 0,
      ...overrides,
    },
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTable(recruitments: RecruitmentSummary[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(<PastRecruitmentsTable clubId={1} recruitments={recruitments} />, { wrapper: Wrapper });
}

function closedRecruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 9,
    clubId: 1,
    clubName: '두잉',
    title: '9기 신입 모집',
    startDate: '2025-09-10',
    endDate: '2025-09-24',
    capacity: 18,
    status: 'CLOSED',
    displayStatus: 'CLOSED',
    effectivelyOpen: false,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    closedAt: null,
    ...over,
  };
}

function statsHandlers(...recruitmentIds: number[]) {
  return recruitmentIds.map((recruitmentId) =>
    http.get(`*/leader/recruitments/${recruitmentId}/stats/summary`, () =>
      HttpResponse.json(summaryResponse()),
    ),
  );
}

describe('PastRecruitmentsTable', () => {
  it('지난 모집이 없으면 빈 상태 문구를 표시한다', () => {
    renderTable([]);
    expect(screen.getByText('아직 마감된 모집이 없어요.')).toBeInTheDocument();
  });

  it('행마다 지원/합격·상태·제목(상세 링크)·결과 보기/양식 복제 링크를 렌더한다', async () => {
    server.use(
      http.get('*/leader/recruitments/9/stats/summary', () =>
        HttpResponse.json(summaryResponse({ total: 41, accepted: 18 })),
      ),
    );
    renderTable([closedRecruitment()]);

    expect((await screen.findAllByText('41 / 18')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('마감').length).toBeGreaterThan(0);

    const titleLinks = screen.getAllByRole('link', { name: '9기 신입 모집' });
    expect(titleLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/9');

    const resultLinks = screen.getAllByRole('link', { name: '결과 보기' });
    expect(resultLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/9/stats');

    const cloneLinks = screen.getAllByRole('link', { name: '양식 복제' });
    expect(cloneLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/new?cloneFrom=9');
  });

  it('summary 조회에 실패한 행은 지원/합격을 —로 표시한다', async () => {
    server.use(
      http.get('*/leader/recruitments/9/stats/summary', () =>
        HttpResponse.json(summaryResponse({ total: 41, accepted: 18 })),
      ),
      http.get('*/leader/recruitments/8/stats/summary', () =>
        HttpResponse.json({ ok: false, message: '오류', data: null }, { status: 500 }),
      ),
    );
    renderTable([closedRecruitment(), closedRecruitment({ id: 8, title: '8기 신입 모집' })]);

    expect((await screen.findAllByText('41 / 18')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('자체 폼 모집은 지원현황으로 바로 가는 지원자 링크를 제공한다', async () => {
    server.use(...statsHandlers(9));
    renderTable([closedRecruitment()]);

    const applicantLinks = await screen.findAllByRole('link', { name: '지원자' });
    expect(applicantLinks[0]).toHaveAttribute('href', '/manage/clubs/1/recruitments/9/applicants');
  });

  it('외부 폼 모집 행에는 지원자 링크를 걸지 않는다', async () => {
    server.use(...statsHandlers(9));
    renderTable([
      closedRecruitment({
        applicationMode: 'EXTERNAL',
        externalFormUrl: 'https://forms.gle/abc',
      }),
    ]);

    expect(await screen.findAllByRole('link', { name: '결과 보기' })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: '지원자' })).toBeNull();
  });

  it('종료 시점 내림차순으로 정렬한다 — lazy-close 스탬프에 순서가 흔들리지 않는다', async () => {
    server.use(...statsHandlers(7, 8, 9));
    renderTable([
      // 마감일이 한참 지난 뒤 신규 모집 등록 시점에 lazy 마감된 모집 — 스탬프가 실제 종료보다 늦다
      closedRecruitment({
        id: 7,
        title: '7기 신입 모집',
        startDate: '2025-03-01',
        endDate: '2025-03-14',
        closedAt: '2025-09-25T01:00:00Z',
      }),
      closedRecruitment({ id: 9, closedAt: '2025-09-24T09:00:00Z' }),
      closedRecruitment({
        id: 8,
        title: '8기 상시 모집',
        startDate: '2025-06-01',
        endDate: null,
        closedAt: '2025-07-02T01:00:00Z',
      }),
    ]);

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows.slice(1).map((row) => within(row).getAllByRole('link')[0]?.textContent)).toEqual([
      '9기 신입 모집',
      '8기 상시 모집',
      '7기 신입 모집',
    ]);
  });

  it('마감 시각이 기록된 모집은 종료 시점을 마감일로 표기한다', async () => {
    server.use(...statsHandlers(9, 8));
    renderTable([
      // 종료일 전 조기 마감 — 기간 표기만으로는 실제 종료 시점을 알 수 없다
      closedRecruitment({ closedAt: '2025-09-18T05:00:00Z' }),
      // 마감 시각이 없는 레거시 상시모집 — 기존 표기 유지
      closedRecruitment({ id: 8, title: '8기 상시 모집', endDate: null, closedAt: null }),
    ]);

    expect((await screen.findAllByText(/마감 2025-09-18/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/마감 2025-09-10/)).toBeNull();
  });
});
