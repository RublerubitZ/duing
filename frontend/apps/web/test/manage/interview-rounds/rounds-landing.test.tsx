import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { InterviewRoundsLanding } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_pages/InterviewRoundsLanding';

// MSW 기반 통합 테스트 — 면접 관리 랜딩 (신규 라운드 목록 기반).
// TanStack Query 자체를 mock 하지 않고 네트워크 레벨에서 mocking 한다.

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const DRAFT_ROUND = {
  roundId: 1,
  title: '1차 면접',
  status: 'DRAFT',
  availabilityDeadline: null,
  location: null,
  totalMemberCount: 5,
  respondedMemberCount: 0,
};

const COLLECTING_ROUND = {
  roundId: 2,
  title: '2차 면접',
  status: 'COLLECTING',
  availabilityDeadline: '2026-07-10T18:00:00',
  location: '공학관',
  totalMemberCount: 3,
  respondedMemberCount: 2,
};

// ── 테스트 설정 ──────────────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderLanding() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <InterviewRoundsLanding clubId={CLUB_ID} recruitmentId={RECRUITMENT_ID} />
    </Wrapper>,
  );
}

// ── 테스트 2건 ───────────────────────────────────────────────────────────────

describe('InterviewRoundsLanding — 면접 관리 랜딩', () => {
  it('라운드가 없으면 빈 상태와 만들기 버튼이 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText('아직 면접 라운드가 없습니다')).toBeInTheDocument();
    });

    // 새 라운드 만들기 버튼이 보여야 한다 (헤더 + 빈 상태 CTA 2개)
    const createButtons = screen.getAllByRole('link', { name: '새 면접 라운드 만들기' });
    expect(createButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('라운드 목록이 상태 뱃지·응답 카운트와 함께 보이고 작성 중 라운드엔 이어서 작성 링크가 있다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({
          ok: true,
          data: [DRAFT_ROUND, COLLECTING_ROUND],
          message: null,
        }),
      ),
    );

    renderLanding();

    // DRAFT 라운드 카드
    await waitFor(() => {
      expect(screen.getByText('1차 면접')).toBeInTheDocument();
    });
    expect(screen.getByText('작성 중')).toBeInTheDocument();
    expect(screen.getByText('응답 0 / 5명')).toBeInTheDocument();

    // DRAFT 카드엔 [이어서 작성] 링크가 있다
    expect(screen.getByRole('link', { name: '이어서 작성' })).toBeInTheDocument();

    // COLLECTING 라운드 카드
    expect(screen.getByText('2차 면접')).toBeInTheDocument();
    expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    expect(screen.getByText('응답 2 / 3명')).toBeInTheDocument();

    // 비DRAFT 카드엔 [이어서 작성] 링크가 없다 — 링크는 DRAFT 1개만 존재
    expect(screen.getAllByRole('link', { name: '이어서 작성' }).length).toBe(1);
  });
});
