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

/** 대기열 후보 — includeUndecided=false 기본 */
const CANDIDATE_A = {
  applicationId: 101,
  userId: 1,
  userName: '이순신',
  studentId: '20230001',
  college: 'ENGINEERING',
  major: '컴퓨터공학',
  grade: 'THIRD',
  status: 'INTERVIEW_PENDING',
  submittedAt: '2026-06-01T10:00:00',
};

const CANDIDATE_B = {
  applicationId: 102,
  userId: 2,
  userName: '강감찬',
  studentId: '20230002',
  college: 'ENGINEERING',
  major: '소프트웨어공학',
  grade: 'SECOND',
  status: 'INTERVIEW_PENDING',
  submittedAt: '2026-06-02T10:00:00',
};

/** 빈 대기열 응답 */
const EMPTY_CANDIDATES_HANDLER = http.get(
  `*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`,
  () => HttpResponse.json({ ok: true, data: [], message: null }),
);

/** 2명 대기열 응답 */
const CANDIDATES_HANDLER = http.get(
  `*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`,
  () => HttpResponse.json({ ok: true, data: [CANDIDATE_A, CANDIDATE_B], message: null }),
);

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

// ── 테스트 5건 ───────────────────────────────────────────────────────────────

describe('InterviewRoundsLanding — 면접 관리 랜딩', () => {
  it('라운드가 없으면 빈 상태와 만들기 버튼이 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      EMPTY_CANDIDATES_HANDLER,
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
      EMPTY_CANDIDATES_HANDLER,
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

  it('대기열에 후보가 있으면 카운트와 이름이 노출된다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      CANDIDATES_HANDLER,
    );

    renderLanding();

    // 대기열 섹션 카운트 — 2명
    await waitFor(() => {
      expect(screen.getByText(/2명/)).toBeInTheDocument();
    });

    // 후보 이름 미리보기
    expect(screen.getByText('이순신')).toBeInTheDocument();
    expect(screen.getByText('강감찬')).toBeInTheDocument();
  });

  it('대기열이 비어 있으면 "대기 중인 지원자가 없습니다" 문구가 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      EMPTY_CANDIDATES_HANDLER,
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText('대기 중인 지원자가 없습니다')).toBeInTheDocument();
    });
  });

  it('대기열 조회가 실패하면 오류 안내가 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      http.get(
        `*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`,
        () => HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText('대기열을 불러오지 못했습니다.')).toBeInTheDocument();
    });
  });

  it('대기열 섹션은 includeUndecided=false 로 요청한다', async () => {
    let capturedIncludeUndecided: string | null = null;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      http.get(
        `*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`,
        ({ request }) => {
          const url = new URL(request.url);
          capturedIncludeUndecided = url.searchParams.get('includeUndecided');
          return HttpResponse.json({ ok: true, data: [], message: null });
        },
      ),
    );

    renderLanding();

    await waitFor(() => {
      expect(capturedIncludeUndecided).toBe('false');
    });
  });
});
