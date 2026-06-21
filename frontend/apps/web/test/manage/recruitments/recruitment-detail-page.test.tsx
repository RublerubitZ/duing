import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { StatsSummary } from '@duing/types';
import RecruitmentDetailPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page';

// 운영진 모집 상세 페이지 — useInterview 토글에 따른 "면접 관리" 링크 노출 +
// 지원 현황 요약/지원자 수 노출 검증. 다른 페이지 테스트와 동일하게 MSW + ApiClient 조합.

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;

// 상세 페이지가 통계 요약(stats/summary)을 1회 호출하므로 onUnhandledRequest:'error' 에서
// 항상 핸들러가 필요하다. 기본 핸들러를 setupServer 에 등록해 resetHandlers 후에도 유지한다.
function statsSummaryHandler(summary: Partial<StatsSummary> = {}) {
  return http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/summary`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        total: 0,
        submitted: 0,
        underReview: 0,
        interviewPending: 0,
        accepted: 0,
        rejected: 0,
        capacity: 10,
        ratio: 0,
        ...summary,
      },
      message: null,
    }),
  );
}

const server = setupServer(statsSummaryHandler());
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function mockRecruitmentDetail(useInterview: boolean) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        id: RECRUITMENT_ID,
        clubId: CLUB_ID,
        clubName: '테스트 동아리',
        title: '테스트 모집',
        startDate: '2099-01-01',
        endDate: '2099-02-01',
        capacity: 10,
        status: 'OPEN',
        displayStatus: 'OPEN',
        effectivelyOpen: true,
        applicationMode: 'SELF',
        externalFormUrl: null,
        useInterview,
        targetRole: 'MEMBER',
        content: null,
        questions: [],
        interviewStartDate: null,
        interviewEndDate: null,
        showApplicantCount: false,
        applicantCount: null,
      },
      message: null,
    }),
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  // React 19 의 use(thenable) 가 정상 fulfilled 상태로 재진입 없이 동기적으로 값을 꺼내가도록
  // status/value 가 미리 태깅된 thenable 을 전달한다 (server-rendered params 와 동일 모양).
  // 일반 Promise.resolve 를 넘기면 use 가 한 번 suspend 한 뒤 microtask 가 act 경계를 벗어나
  // jsdom + vitest 환경에서 영구 loading 으로 막힌다.
  const paramsValue = {
    clubId: String(CLUB_ID),
    recruitmentId: String(RECRUITMENT_ID),
  };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });

  return render(
    <Wrapper>
      <Suspense fallback={<p>loading…</p>}>
        <RecruitmentDetailPage params={params} />
      </Suspense>
    </Wrapper>,
  );
}

/** 빈 라운드 목록 핸들러 — InterviewStageChip 이 useInterviewRoundsQuery 를 호출하므로 필요 */
const EMPTY_ROUNDS_HANDLER = http.get(
  `*/recruitments/${RECRUITMENT_ID}/interview-rounds`,
  () => HttpResponse.json({ ok: true, data: [], message: null }),
);

describe('RecruitmentDetailPage — 면접 관리 진입 링크 (Issue 1)', () => {
  it('useInterview=true 면 "면접 관리" 링크가 노출된다', async () => {
    server.use(mockRecruitmentDetail(true), EMPTY_ROUNDS_HANDLER);

    renderPage();

    // 면접 관리 링크는 액션 버튼 + 단계 칩 영역 총 두 곳 이상 노출될 수 있다
    const links = await screen.findAllByRole('link', { name: '면접 관리' });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/interview`,
    );
  });

  it('useInterview=false 면 "면접 관리" 링크가 노출되지 않는다', async () => {
    // useInterview=false 시 InterviewStageChip 자체가 미렌더링되므로 rounds 요청 없음
    server.use(mockRecruitmentDetail(false));

    renderPage();

    // 다른 액션 버튼이 먼저 떠야 페이지 로딩이 끝났음을 알 수 있다.
    // 지원자 수 배지가 라벨에 붙을 수 있으므로 부분 일치로 찾는다.
    await screen.findByRole('link', { name: /지원자 관리/ });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '면접 관리' })).not.toBeInTheDocument(),
    );
  });
});

describe('RecruitmentDetailPage — 지원 현황 요약 + 지원자 수 (모집 관리 UX 개선)', () => {
  it('통계 요약이 오면 지원자 관리 버튼에 지원자 수가, 요약 칩에 합격·합격률이 노출된다', async () => {
    server.use(
      mockRecruitmentDetail(false),
      statsSummaryHandler({ total: 14, accepted: 5, capacity: 10, ratio: 0.5 }),
    );

    renderPage();

    // 지원자 관리 버튼 라벨에 총 지원자 수(14)가 함께 노출된다.
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /지원자 관리\s*14/ }),
      ).toBeInTheDocument(),
    );

    // 요약 칩 — 합격 인원과 합격률(50.0%) 미리보기.
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('통계 요약 호출이 실패하면 요약 칩과 지원자 수 없이 버튼만 정상 노출된다', async () => {
    server.use(
      mockRecruitmentDetail(false),
      http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/summary`, () =>
        HttpResponse.json({ ok: false, data: null, message: 'error' }, { status: 500 }),
      ),
    );

    renderPage();

    // 지원자 관리 링크는 숫자 없이도 항상 활성으로 노출된다(버그/비활성 아님).
    const applicantsLink = await screen.findByRole('link', { name: /지원자 관리/ });
    expect(applicantsLink).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/applicants`,
    );
    // 합격률 미리보기 칩은 데이터가 없으므로 렌더되지 않는다.
    expect(screen.queryByText('합격률')).not.toBeInTheDocument();
  });
});

describe('RecruitmentDetailPage — 면접 진행 단계표시 칩 (§10.5)', () => {
  it('COLLECTING 라운드가 있으면 "응답 대기 2/3" 형식의 단계 칩이 노출된다', async () => {
    server.use(
      mockRecruitmentDetail(true),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              roundId: 99,
              title: '1차 면접',
              status: 'COLLECTING',
              availabilityDeadline: '2026-07-10T18:00:00',
              location: '공학관',
              totalMemberCount: 3,
              respondedMemberCount: 2,
            },
          ],
          message: null,
        }),
      ),
    );

    renderPage();

    // 단계 칩 — "응답 대기 n/N" 형식
    await waitFor(() => {
      expect(screen.getByText(/응답 대기/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });

  it('라운드가 없으면 단계 칩에 "면접 대상 선정 전" 이 보인다', async () => {
    server.use(
      mockRecruitmentDetail(true),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('면접 대상 선정 전')).toBeInTheDocument();
    });
  });
});
