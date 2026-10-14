import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { todayKstDateString } from '@duing/hooks/datetime';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import type { ApplicationSummary, MyClubMembership, StudentRecruitmentProjection } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ClubDetailApplyBar } from '../../app/clubs/[clubId]/_components/ClubDetailApplyBar';
import type { ClubDetailCheck } from '../../app/clubs/[clubId]/_lib/useClubApply';

const mockAuthStatus = { value: 'unauthenticated' };
// 지원 흐름은 useSeededAuthStatus 로 스토어를 직접 구독한다(useSyncExternalStore) — 셀렉터 호출만
// 흉내 내면 subscribe/getState 가 없어 렌더가 터진다.
vi.mock('@duing/stores', () => ({
  selectIsAuthenticated: (state: { status: string }) => state.status === 'authenticated',
  useAuthStore: Object.assign(
    (selector: (state: { status: string }) => unknown) => selector({ status: mockAuthStatus.value }),
    {
      subscribe: () => () => {},
      getState: () => ({ status: mockAuthStatus.value }),
      getInitialState: () => ({ status: mockAuthStatus.value }),
    },
  ),
}));

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

// 로그인 상태에서 하단 바가 내 지원 목록(ALL)을 조회한다 — 기본은 지원 없음.
const server = setupServer(
  http.get('*/users/me/applications', () => HttpResponse.json({ ok: true, data: [], message: null })),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
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
  endDate: '2099-12-31',
  displayStatus: 'OPEN',
  capacity: 20,
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

const memberMembership: MyClubMembership = {
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00Z',
  permissions: {
    canPostNotice: false,
    canEditNotice: false,
    canDeleteNotice: false,
    canPostEvent: false,
    canEditEvent: false,
    canDeleteEvent: false,
  },
};

const myApplication: ApplicationSummary = {
  id: 77,
  recruitmentId: base.id,
  recruitmentTitle: base.title,
  clubId: 7,
  clubName: '두잉',
  category: 'ACADEMIC',
  logoUrl: null,
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-05-02T09:00:00Z',
};

function mockMyApplications(applications: ApplicationSummary[]) {
  return http.get('*/users/me/applications', () =>
    HttpResponse.json({ ok: true, data: applications, message: null }),
  );
}

// 이 브라우저가 방금 받은 상세 — 잠금·재확인 없이 지금처럼 동작한다.
const checkedNow = (): ClubDetailCheck => ({
  checkedAt: Date.now(),
  checkFailed: false,
  recheck: async () => true,
});

// ISR 스냅샷 — 이 브라우저가 아직 상세를 받지 못했다(버튼은 잠긴다).
const snapshotCheck = (): ClubDetailCheck => ({
  checkedAt: 0,
  checkFailed: false,
  recheck: async () => true,
});

function renderBar(
  recruitment: StudentRecruitmentProjection | undefined,
  membership?: MyClubMembership | null,
  detailCheck: ClubDetailCheck = checkedNow(),
) {
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
      <ClubDetailApplyBar recruitment={recruitment} membership={membership} detailCheck={detailCheck} />
    </Wrapper>,
  );
}

describe('ClubDetailApplyBar — 모바일 하단 지원 바', () => {
  it('OPEN(마감일 있음) → 상단 D-day, 강조 "N명 모집중", 활성 지원 버튼', () => {
    renderBar(base);
    expect(screen.getByText(/^모집중 · D-\d+$/)).toBeInTheDocument();
    expect(screen.getByText('20명 모집중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('마감 당일 → 상단 "모집중 · D-day" ("D-0" 표기 금지)', () => {
    renderBar({ ...base, endDate: todayKstDateString(new Date()) });
    expect(screen.getByText('모집중 · D-day')).toBeInTheDocument();
  });

  it('상시모집 → 상단 "상시모집", 활성 지원 버튼', () => {
    renderBar({ ...base, displayStatus: 'ALWAYS_OPEN', endDate: null });
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).not.toBeDisabled();
  });

  it('CLOSED → 종료 문구 + 비활성 지원 버튼', () => {
    renderBar({ ...base, displayStatus: 'CLOSED' });
    expect(screen.getByText('모집 마감')).toBeInTheDocument();
    expect(screen.getByText('이번 모집은 종료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('모집 없음 → 안내 문구 + 비활성 지원 버튼', () => {
    renderBar(undefined);
    expect(screen.getByText('현재 모집이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  it('EXTERNAL 모집 → 버튼 라벨 "외부 폼으로 이동"', () => {
    renderBar({ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://x' });
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeInTheDocument();
  });

  it('비로그인 상태로 지원하기를 누르면 사전 확인 없이 로그인 페이지로 이동한다', async () => {
    const user = userEvent.setup();
    renderBar(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(`/apply/${base.id}`)}`,
    );
  });

  it('EXTERNAL 모집은 사전 확인 없이 새 탭으로 외부 폼을 연다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderBar({ ...base, applicationMode: 'EXTERNAL', externalFormUrl: 'https://example.com/form' });

    await user.click(screen.getByRole('button', { name: '외부 폼으로 이동' }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/form',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('스냅샷 확인이 실패하면 좌측 라벨이 새로고침 안내로 바뀌고 버튼은 잠긴다', () => {
    renderBar(
      { ...base, displayStatus: 'ALWAYS_OPEN', endDate: null },
      undefined,
      { checkedAt: 0, checkFailed: true, recheck: async () => true },
    );
    expect(screen.getByText('모집 정보 확인 실패')).toBeInTheDocument();
    expect(screen.getByText('새로고침해 주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
  });

  // 안내는 잠긴 이유가 확인 실패일 때만 — 지원서 보기 링크는 그대로 열리고, 소속 잠금은 새로고침해도 그대로다.
  it('확인 실패여도 이미 지원한 모집이면 좌측 라벨은 그대로고 지원서 보기 링크만 보인다', async () => {
    mockAuthStatus.value = 'authenticated';
    server.use(mockMyApplications([myApplication]));
    renderBar(base, undefined, { checkedAt: 0, checkFailed: true, recheck: async () => true });

    expect(await screen.findByRole('link', { name: '지원 완료 · 지원서 보기' })).toBeInTheDocument();
    expect(screen.queryByText('모집 정보 확인 실패')).not.toBeInTheDocument();
    expect(screen.getByText('20명 모집중')).toBeInTheDocument();
  });

  it('확인 실패여도 소속 잠금이면 좌측 라벨은 그대로고 잠금 이유만 보인다', () => {
    renderBar({ ...base, targetRole: 'MEMBER' }, memberMembership, {
      checkedAt: 0,
      checkFailed: true,
      recheck: async () => true,
    });

    expect(screen.getByRole('button', { name: '이미 소속된 동아리예요' })).toBeDisabled();
    expect(screen.queryByText('모집 정보 확인 실패')).not.toBeInTheDocument();
    expect(screen.getByText('20명 모집중')).toBeInTheDocument();
  });

  it('ISR 스냅샷이면 열린 외부 폼 모집도 버튼이 잠기고 눌러도 열리지 않는다', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      renderBar(
        {
          ...base,
          displayStatus: 'ALWAYS_OPEN',
          endDate: null,
          applicationMode: 'EXTERNAL',
          externalFormUrl: 'https://example.com/form',
        },
        undefined,
        snapshotCheck(),
      );
      // 스냅샷 동안은 확인 중 스피너의 이름이 라벨 앞에 붙는다 — jsdom 은 inline 자식 사이 공백을 넣지 않는다.
      const button = screen.getByRole('button', { name: /^모집 정보 확인 중\s?외부 폼으로 이동$/ });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
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
    renderBar(base);

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
    renderBar(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    expect(await screen.findByText('이미 지원한 모집 공고입니다.')).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  // 부원 모집은 이미 소속된 사람이 누르면 서버가 409 로 거절한다 — 누르기 전에 이유를 보여준다.
  it('부원 모집에 이미 소속된 뷰어면 버튼을 잠그고 이유를 보여준다', () => {
    renderBar({ ...base, targetRole: 'MEMBER' }, memberMembership);
    expect(screen.getByRole('button', { name: '이미 소속된 동아리예요' })).toBeDisabled();
  });

  it('운영진 모집은 소속이어도 지원 버튼이 열려 있다', () => {
    renderBar({ ...base, targetRole: 'OFFICER' }, memberMembership);
    expect(screen.getByRole('button', { name: '지원하기' })).toBeEnabled();
  });

  it('membership 이 undefined(비로그인·로딩)면 기존대로 열려 있다', () => {
    renderBar({ ...base, targetRole: 'MEMBER' });
    expect(screen.getByRole('button', { name: '지원하기' })).toBeEnabled();
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
    renderBar(base);

    await user.click(screen.getByRole('button', { name: '지원하기' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '지원 자격 확인 중' })).toBeDisabled();
    });
  });

  // 서버는 중복 지원을 상태와 무관하게 409 로 막는다(REJECTED 포함) — 버튼 대신 제출한 지원서로 보낸다.
  it('이미 지원한 모집이면 지원 버튼 대신 "지원 완료 · 지원서 보기" 링크를 보여준다', async () => {
    mockAuthStatus.value = 'authenticated';
    server.use(mockMyApplications([myApplication]));
    renderBar(base);

    const link = await screen.findByRole('link', { name: '지원 완료 · 지원서 보기' });
    expect(link).toHaveAttribute('href', '/me/applications/77');
    expect(screen.queryByRole('button', { name: '지원하기' })).not.toBeInTheDocument();
  });

  it('이미 지원했어도 부원 모집에 소속이면 소속 잠금 안내가 우선이다', async () => {
    mockAuthStatus.value = 'authenticated';
    server.use(mockMyApplications([myApplication]));
    renderBar({ ...base, targetRole: 'MEMBER' }, memberMembership);

    expect(await screen.findByRole('button', { name: '이미 소속된 동아리예요' })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole('link', { name: '지원 완료 · 지원서 보기' })).not.toBeInTheDocument());
  });

  // 스냅샷이라 잠근 것뿐인 지원 가능 모집은 버튼 안에 확인 중 스피너를 둔다 — 느린 회선에서 이유 없는 잠금으로 보이지 않게(#1456).
  // jsdom 은 inline 자식 사이 공백을 넣지 않아, 스냅샷 버튼은 스피너 이름과 라벨이 이어진 이름을 정규식으로 찾는다.
  describe('ISR 스냅샷 확인 중 스피너', () => {
    const awaitingCases: ReadonlyArray<
      readonly [string, StudentRecruitmentProjection, string, RegExp]
    > = [
      ['모집중', base, '지원하기', /^모집 정보 확인 중\s?지원하기$/],
      [
        '상시모집 외부 폼',
        {
          ...base,
          displayStatus: 'ALWAYS_OPEN',
          endDate: null,
          applicationMode: 'EXTERNAL',
          externalFormUrl: 'https://example.com/form',
        },
        '외부 폼으로 이동',
        /^모집 정보 확인 중\s?외부 폼으로 이동$/,
      ],
    ];
    it.each(awaitingCases)(
      '%s 스냅샷이면 라벨은 그대로 두고 잠긴 버튼 안에 확인 중 상태를 둔다',
      (_caseName, recruitment, label, buttonName) => {
        renderBar(recruitment, undefined, snapshotCheck());

        const button = screen.getByRole('button', { name: buttonName });
        const spinnerStatus = within(button).getByRole('status', { name: '모집 정보 확인 중' });
        expect(spinnerStatus).toHaveClass('delayed-show-late', 'absolute', 'right-full');
        expect(spinnerStatus.querySelector('svg')).not.toHaveClass('delayed-show-late');
        expect(button).toHaveTextContent(label);
        expect(button).toBeDisabled();
      },
    );

    // 마감·예정·모집 없음은 좌측 라벨이 이미 잠긴 이유를 말한다.
    const explainedLockCases: ReadonlyArray<
      readonly [string, StudentRecruitmentProjection | undefined]
    > = [
      ['마감', { ...base, displayStatus: 'CLOSED' }],
      ['모집예정', { ...base, displayStatus: 'UPCOMING' }],
      ['모집 없음', undefined],
    ];
    it.each(explainedLockCases)(
      '%s 스냅샷이면 확인 중 상태 없이 라벨만 둔다',
      (_caseName, recruitment) => {
        renderBar(recruitment, undefined, snapshotCheck());

        expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '지원하기' })).toBeDisabled();
      },
    );

    it('확인이 실패하면 확인 중 상태 대신 새로고침 안내를 둔다', () => {
      renderBar(base, undefined, { checkedAt: 0, checkFailed: true, recheck: async () => true });

      expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
      expect(screen.getByText('모집 정보 확인 실패')).toBeInTheDocument();
      expect(screen.getByText('새로고침해 주세요')).toBeInTheDocument();
    });

    it('최신 상세를 받은 뒤에는 확인 중 상태 없이 버튼이 열린다', () => {
      renderBar(base, undefined, checkedNow());

      expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '지원하기' })).toBeEnabled();
    });

    it('소속 잠금이면 확인 중 상태 없이 잠금 이유를 둔다', () => {
      renderBar({ ...base, targetRole: 'MEMBER' }, memberMembership, snapshotCheck());

      expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '이미 소속된 동아리예요' })).toBeDisabled();
    });

    it('이미 지원한 모집이면 확인 중 상태 없이 지원서 보기 링크를 둔다', async () => {
      mockAuthStatus.value = 'authenticated';
      server.use(mockMyApplications([myApplication]));
      renderBar(base, undefined, snapshotCheck());

      expect(await screen.findByRole('link', { name: '지원 완료 · 지원서 보기' })).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
    });
  });
});
