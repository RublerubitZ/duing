import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, todayKstDateString } from '@duing/hooks';

import { CurrentRecruitmentCard } from '../../app/manage/clubs/[clubId]/recruitments/_components/CurrentRecruitmentCard';
import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

// 외부 폼 카드가 렌더하는 가입 링크 액션은 자체 쿼리를 가진다 — 접수 마감 검증과 무관하므로 대체한다.
vi.mock(
  '../../app/manage/clubs/[clubId]/recruitments/_components/ExternalRecruitmentActions',
  () => ({
    ExternalRecruitmentActions: () => <div>가입 링크 액션</div>,
  }),
);

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() =>
  server.listen({
    onUnhandledRequest: (req) => {
      console.error(`Unhandled ${req.method} ${req.url}`);
      throw new Error(`Unhandled ${req.method} ${req.url}`);
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// 접수 마감 게이트는 KST 오늘과 startDate 문자열 비교다 — 픽스처도 같은 유틸로 만들어 자정 경계에 어긋나지 않게 한다.
const KST_TODAY = todayKstDateString(new Date());
const KST_YESTERDAY = todayKstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

const alwaysOpenRecruitment: RecruitmentSummary = {
  id: 1,
  clubId: 10,
  clubName: '두잉 동아리',
  title: '상시 부원 모집',
  startDate: KST_YESTERDAY,
  endDate: null,
  capacity: 10,
  status: 'OPEN',
  displayStatus: 'ALWAYS_OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
  closedAt: null,
};

const emptyStatsSummary: StatsSummary = {
  total: 0,
  submitted: 0,
  onHold: 0,
  interviewPending: 0,
  accepted: 0,
  rejected: 0,
  capacity: 10,
  ratio: 0,
};

function statsSummaryHandler() {
  return http.get('*/leader/recruitments/:recruitmentId/stats/summary', () =>
    HttpResponse.json({ ok: true, data: emptyStatsSummary, message: null }),
  );
}

function renderCard(recruitment: RecruitmentSummary) {
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

  return render(
    <Wrapper>
      <CurrentRecruitmentCard clubId={10} recruitment={recruitment} />
    </Wrapper>,
  );
}

describe('CurrentRecruitmentCard — 상시모집 접수 마감', () => {
  it('시작일이 지난 상시모집이면 접수 마감 버튼이 활성화되고 확인 시 접수 마감 API 를 호출한다', async () => {
    let stopIntakeCallCount = 0;
    server.use(
      statsSummaryHandler(),
      http.patch('*/leader/recruitments/1/stop-intake', () => {
        stopIntakeCallCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderCard(alwaysOpenRecruitment);

    const stopIntakeButton = screen.getByRole('button', { name: '접수 마감' });
    expect(stopIntakeButton).toBeEnabled();
    fireEvent.click(stopIntakeButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('접수를 마감할까요?');
    expect(dialog).toHaveTextContent('심사와 면접은 계속 진행할 수 있습니다');
    // 자체 폼에는 가입 링크가 없다 — 링크 문구가 나오면 안 된다.
    expect(dialog).not.toHaveTextContent('가입 링크');

    // 모달이 열려 있는 동안 카드 버튼은 aria-hidden 뒤라 role 쿼리에 잡히지 않는다 — 확인 버튼만 남는다.
    fireEvent.click(screen.getByRole('button', { name: '접수 마감' }));

    await waitFor(() => expect(stopIntakeCallCount).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('외부 폼 상시모집의 접수 마감 안내는 기존 가입 링크가 계속 유효함을 알린다', () => {
    renderCard({
      ...alwaysOpenRecruitment,
      applicationMode: 'EXTERNAL',
      externalFormUrl: 'https://forms.gle/abc',
    });

    fireEvent.click(screen.getByRole('button', { name: '접수 마감' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('이미 발급된 가입 링크는 계속 유효합니다');
    expect(dialog).toHaveTextContent('신규 가입 링크 발급은 중단');
  });

  it('모집 시작일 당일에는 접수 마감 버튼이 비활성화되고 사유를 안내한다', () => {
    server.use(statsSummaryHandler());
    renderCard({ ...alwaysOpenRecruitment, startDate: KST_TODAY });

    expect(screen.getByRole('button', { name: '접수 마감' })).toBeDisabled();
    expect(screen.getByText(/모집 시작일 다음 날부터 접수를 마감할 수 있습니다/)).toBeInTheDocument();
  });

  it('기간모집에는 접수 마감 버튼이 없다', () => {
    server.use(statsSummaryHandler());
    renderCard({
      ...alwaysOpenRecruitment,
      endDate: '2999-12-31',
      displayStatus: 'OPEN',
    });

    expect(screen.queryByRole('button', { name: '접수 마감' })).not.toBeInTheDocument();
    // 기존 마감 액션은 그대로다.
    expect(screen.getByRole('button', { name: '모집 종료' })).toBeInTheDocument();
  });
});

describe('RecruitmentForm — 상시모집 접수 마감 정책 안내', () => {
  it('생성 화면에서 상시모집을 선택하면 시작일 다음 날부터 접수를 마감할 수 있다는 안내가 노출된다', () => {
    render(
      <RecruitmentForm
        mode="create"
        submitLabel="모집 시작"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        isPending={false}
      />,
    );

    expect(screen.queryByText(/모집 시작일 다음 날부터/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /상시모집/ }));

    expect(screen.getByText(/모집 시작일 다음 날부터/)).toBeInTheDocument();
  });
});
