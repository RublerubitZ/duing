import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import type { StudentRecruitmentProjection } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ClubRecruitmentCard } from '../../app/clubs/[clubId]/_components/ClubRecruitmentCard';

const mockAuthStatus = { value: 'unauthenticated' };
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: mockAuthStatus.value }),
}));

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

vi.mock('../../app/_components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: ({ className }: { className?: string }) => (
    <button className={className}>찜하기</button>
  ),
}));

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
afterEach(() => {
  server.resetHandlers();
  mockRouterPush.mockReset();
  mockAuthStatus.value = 'unauthenticated';
});
afterAll(() => server.close());

const base: StudentRecruitmentProjection = {
  id: 1,
  title: 'X',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  displayStatus: 'OPEN',
  capacity: 10,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

function mockEligibility(
  status: number,
  body: { ok: boolean; data: null; message: string | null },
) {
  return http.get(`*/recruitments/${base.id}/applications/eligibility`, () =>
    HttpResponse.json(body, { status }),
  );
}

function renderCard(recruitment: StudentRecruitmentProjection | undefined, clubId = 7) {
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
      <ClubRecruitmentCard recruitment={recruitment} clubId={clubId} />
    </Wrapper>,
  );
}

describe('ClubRecruitmentCard', () => {
  it('모집 없음이면 비활성 지원 버튼과 안내 문구', () => {
    renderCard(undefined);
    expect(screen.getByText('모집 없음')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '지원하기' });
    expect(button).toBeDisabled();
    // 찜 버튼은 모집 유무와 무관하게 전 상태 카드에서 항상 노출된다.
    expect(screen.getByRole('button', { name: '찜하기' })).toBeInTheDocument();
  });

  it('찜 버튼은 카드 우상단에 absolute 플로팅되고 하단 찜 행은 제거된다', () => {
    renderCard(base);
    const favoriteButton = screen.getByRole('button', { name: '찜하기' });
    const applyButton = screen.getByRole('button', { name: '지원하기' });

    // 위치: aside 루트(positioning context) 직속 absolute 플로팅.
    expect(favoriteButton).toHaveClass('absolute', 'right-5', 'top-5');
    expect(favoriteButton.parentElement?.tagName).toBe('ASIDE');
    expect(favoriteButton.parentElement).toHaveClass('relative');

    // 하단 찜 행 제거 — 지원 버튼보다 DOM 앞(우상단).
    expect(
      favoriteButton.compareDocumentPosition(applyButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('상시모집이면 헤더에 "상시모집"이 노출되고 지원 버튼이 활성화된다', () => {
    renderCard({ ...base, displayStatus: 'ALWAYS_OPEN', endDate: null });
    expect(screen.getAllByText('상시모집').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('CLOSED 면 지원 버튼이 비활성화된다', () => {
    renderCard({ ...base, displayStatus: 'CLOSED' });
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('EXTERNAL 모집이면 버튼 라벨이 "외부 폼으로 이동"', () => {
    renderCard({ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://x' });
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeInTheDocument();
  });

  it('비로그인 상태로 지원하기를 누르면 사전 확인 없이 로그인 페이지로 이동한다', async () => {
    const user = userEvent.setup();
    renderCard(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(`/apply/${base.id}`)}`,
    );
  });

  it('EXTERNAL 모집은 사전 확인 없이 새 탭으로 외부 폼을 연다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderCard({ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://example.com/form' });

    await user.click(screen.getByRole('button', { name: '외부 폼으로 이동' }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/form',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('지원 가능하면 사전 확인 후 지원서 페이지로 이동한다', async () => {
    mockAuthStatus.value = 'authenticated';
    let eligibilityChecked = false;
    server.use(
      http.get(`*/recruitments/${base.id}/applications/eligibility`, () => {
        eligibilityChecked = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const user = userEvent.setup();
    renderCard(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith(`/apply/${base.id}`));
    expect(eligibilityChecked).toBe(true);
  });

  it('지원 불가 사유는 토스트로 표시하고 이동하지 않는다', async () => {
    mockAuthStatus.value = 'authenticated';
    server.use(
      mockEligibility(409, { ok: false, data: null, message: '이미 지원한 모집 공고입니다.' }),
    );
    const user = userEvent.setup();
    renderCard(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    expect(await screen.findByText('이미 지원한 모집 공고입니다.')).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('사전 확인 중에는 지원하기 버튼이 비활성화되고 확인 중 스피너가 표시된다', async () => {
    mockAuthStatus.value = 'authenticated';
    server.use(
      http.get(`*/recruitments/${base.id}/applications/eligibility`, async () => {
        await delay('infinite');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const user = userEvent.setup();
    renderCard(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '지원 자격 확인 중' })).toBeDisabled();
    });
  });
});
