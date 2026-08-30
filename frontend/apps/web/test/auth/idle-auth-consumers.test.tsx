import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient, registerUnauthorizedHandler } from '@duing/api';
import { ApiClientProvider, favoriteQueryKeys, useFavoriteToggleMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { AuthStatus } from '@duing/stores';
import type { StudentRecruitmentProjection } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { AdminRoleGuard } from '@/app/admin/_components/AdminRoleGuard';
import { FavoriteToggleButton } from '@/app/_components/FavoriteToggleButton';
import { HomeNavAuthSlot } from '@/app/_components/HomeNavAuthSlot';
import { useClubApply } from '@/app/clubs/[clubId]/_lib/useClubApply';

/**
 * status 는 "모른다"를 표현하지 않는다 — 부팅 시드든 서버 확정이든 언제나 현재 최선의 판단이고,
 * 화면은 첫 렌더부터 그 값으로 그린다(§8.1). 대기 자리표시가 되살아나면 하드 로드마다
 * 로그아웃 화면·깜빡임이 다시 보인다(2026-08-03 재현). 소비자별로 그 규약을 고정한다.
 *
 * 예외는 "되돌릴 수 없는 동작" 축이다 — 찜 토글의 방향처럼 시드로 알 수 없는 값에 걸린 동작은
 * 그 값이 도착할 때까지 막는다. 화면을 여는 것과 동작을 허용하는 것은 다른 판단이다.
 *
 * 스토어는 모킹하지 않고 실제 zustand 를 쓴다 — 검증 대상이 시드→확정 "전이" 라,
 * 정적 스냅샷만 검증하는 모킹으로는 회귀를 못 잡는다.
 */
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 이 스위트에서 나간 API 요청 경로 — "요청 없이 튕겼는지" 를 단언으로 확인한다. */
const requestedPaths: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  requestedPaths.push(new URL(request.url).pathname);
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  // 등록 → null 순서로 사이드 채널을 비운다 — expiredSession 헬퍼가 만든 종료 통지가
  // 핸들러 미등록 상태에서 보류로 남으면, 이후 등록하는 테스트에 유령 만료가 재생된다.
  registerUnauthorizedHandler(() => {});
  registerUnauthorizedHandler(null);
  mockRouterPush.mockReset();
  requestedPaths.length = 0;
  window.history.replaceState(null, '', '/');
  // 부분 setState 로 되돌리면 isVerified 같은 필드가 테스트 간에 새어 나간다 — 초기값 전체로 교체.
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

/** 렌더 본문에서 만들면 재렌더 때 조용히 교체돼 캐시 단언이 공허하게 참이 된다 — 밖에서 만든다. */
let latestQueryClient = new QueryClient();

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={latestQueryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{children}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}

function renderWithProviders(ui: ReactNode) {
  latestQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<Wrapper>{ui}</Wrapper>);
}
const setAuthStatus = (status: AuthStatus) =>
  act(() => useAuthStore.setState({ status, user: null }));

/** 세션 만료가 확정되는 응답 한 쌍 — 원 401 과, 갱신 시도까지 실패시키는 refresh 401. */
function expiredSession(path: string) {
  return [
    http.all(`${BASE}${path}`, () =>
      HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/web/refresh`, () => new HttpResponse(null, { status: 401 })),
  ];
}

// 시드 모델에는 "확인 중" 이라는 대기 상태가 없다 — status 는 언제나 현재 최선의 판단이고
// 첫 렌더부터 그 값으로 그린다. 자리표시가 다시 생기면 metric 2(레이아웃 시프트·깜빡임)가
// 되살아나므로, DOM 에 존재하지 않음까지 단언한다.
describe('HomeNavAuthSlot — 시드된 값으로 첫 렌더부터 그린다', () => {
  it('미인증 시드면 즉시 로그인·회원가입이고 확인 중 자리표시는 아예 없다(metric 2)', () => {
    setAuthStatus('unauthenticated');
    renderWithProviders(<HomeNavAuthSlot />);

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('인증 시드면 즉시 유저 메뉴이고 로그인 진입점은 나오지 않는다(metric 1)', async () => {
    // 시드 직후에는 프로필이 아직 없다 — 이름은 '회원' 폴백으로 채워진다.
    server.use(http.get(`${BASE}/users/me`, () => new Promise(() => {})));
    setAuthStatus('authenticated');
    renderWithProviders(<HomeNavAuthSlot initialAuthenticated />);

    expect(await screen.findByRole('button', { name: /회원님/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// role 은 시드에 실리지 않는다(§9.3) — 판정은 늘 서버 프로필이고, 프로필이 오기 전까지가
// "확인 중" 이다. 그 사이 거부 문구를 먼저 띄우면 총동연 계정 하드 로드마다 그걸 본다(metric 4).
describe('AdminRoleGuard — 프로필이 도착하기 전에는 권한을 판정하지 않는다', () => {
  const adminDenied = '총동연(관리자) 권한이 필요합니다.';
  const meUser = (role: 'ADMIN' | 'STUDENT') => ({
    id: 1,
    studentId: '20200001',
    name: '홍길동',
    phone: '01000000000',
    grade: 'THIRD',
    role,
  });

  it('시드된 인증에서 프로필이 아직 없으면 거부 문구 없이 확인 중을 렌더한다(metric 4)', async () => {
    server.use(http.get(`${BASE}/users/me`, () => new Promise(() => {})));
    setAuthStatus('authenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(screen.queryByText(adminDenied)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '권한 확인 중' })).toBeInTheDocument();
    // 프로필 요청이 실제로 나가는지까지 본다 — 안 나가면 "확인 중" 이 영구 대기가 된다.
    await waitFor(() => expect(requestedPaths).toContain('/api/v1/users/me'));
  });

  it('프로필이 ADMIN 이면 콘텐츠를 렌더한다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: meUser('ADMIN'), message: null }),
      ),
    );
    setAuthStatus('authenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(await screen.findByText('관리자 콘텐츠')).toBeInTheDocument();
  });

  it('프로필 role 이 ADMIN 이 아니면 권한 거부 문구를 렌더한다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: meUser('STUDENT'), message: null }),
      ),
    );
    setAuthStatus('authenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(await screen.findByText(adminDenied)).toBeInTheDocument();
    expect(screen.queryByText('관리자 콘텐츠')).not.toBeInTheDocument();
  });

  // 조회 실패는 "권한 미확인" 이다 — 관리자 콘솔은 fail-closed 라 확인 중에 머물지 않고 거부한다.
  it('프로필 조회가 실패하면 확인 중에 머물지 않고 거부한다', async () => {
    server.use(http.get(`${BASE}/users/me`, () => new HttpResponse(null, { status: 500 })));
    setAuthStatus('authenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(await screen.findByText(adminDenied)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '권한 확인 중' })).not.toBeInTheDocument();
  });

  it('미인증이면 프로필 요청 없이 권한 거부 문구를 렌더한다', () => {
    setAuthStatus('unauthenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(screen.getByText(adminDenied)).toBeInTheDocument();
    expect(requestedPaths).toHaveLength(0);
  });
});

describe('FavoriteToggleButton — 방향을 모르는 동안에는 누를 수 없다', () => {
  // 시드는 "로그인했다"까지만 말해 준다 — 무엇을 찜했는지는 목록이 와야 안다. 목록이 오기 전에는
  // 찜한 동아리도 빈 하트로 보이므로, 그대로 누르면 해제가 아니라 추가가 나가 409 로 조용히
  // 실패한다. 화면은 시드로 열되 방향이 걸린 동작만 막는다(§8.1 되돌릴 수 없는 동작).
  it('시드된 인증에서 찜 목록이 오기 전에는 하트가 비활성이고 토글이 나가지 않는다', async () => {
    server.use(http.get(`${BASE}/me/favorites/ids`, () => new Promise(() => {})));
    setAuthStatus('authenticated');
    renderWithProviders(<FavoriteToggleButton clubId={7} />);

    const heart = screen.getByRole('button', { name: '찜 추가' });
    expect(heart).toBeDisabled();
    await userEvent.click(heart);

    expect(requestedPaths).not.toContain('/api/v1/me/favorites/7');
    expect(mockRouterPush).not.toHaveBeenCalled();
    // 낙관적 갱신조차 만들지 않는다 — 되돌릴 이전 값이 없어 실패 시 채워진 하트가 남는다.
    expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toBeUndefined();
  });

  it('찜 목록이 도착하면 활성화되고 이미 찜한 동아리는 해제 방향으로 나간다', async () => {
    const toggleMethods: string[] = [];
    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [7] }, message: null }),
      ),
      http.delete(`${BASE}/me/favorites/7`, () => {
        toggleMethods.push('DELETE');
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
      http.post(`${BASE}/me/favorites/7`, () => {
        toggleMethods.push('POST');
        return HttpResponse.json({ ok: true, data: 1, message: null });
      }),
    );
    setAuthStatus('authenticated');
    renderWithProviders(<FavoriteToggleButton clubId={7} />);

    // 목록이 도착해야 "찜 해제"(=이미 찜함)로 바뀌고 그때 눌 수 있다.
    const heart = await screen.findByRole('button', { name: '찜 해제' });
    expect(heart).toBeEnabled();
    await userEvent.click(heart);

    // 방향 정확성 — 추가(POST)가 아니라 해제(DELETE) 로 나가야 한다.
    await waitFor(() => expect(toggleMethods).toEqual(['DELETE']));
  });

  it('확인 후 access 가 만료돼 401 이 오면 로그인으로 보내고 찜 캐시를 남기지 않는다', async () => {
    setAuthStatus('authenticated');
    window.history.replaceState(null, '', '/clubs?favorite=true&page=2');
    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [] }, message: null }),
      ),
      ...expiredSession('/me/favorites/7'),
    );

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    // 복귀 주소에 쿼리스트링까지 실려야 필터·페이지가 걸린 목록으로 되돌아온다.
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2Fclubs%3Ffavorite%3Dtrue%26page%3D2'),
    );
    expect(requestedPaths).toContain('/api/v1/me/favorites/7');
    // 이전 값이 있으면 그 값으로 되돌린다(하트가 채워진 채 남지 않는다).
    expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toEqual({ clubIds: [] });
  });

  // 되돌릴 이전 값이 없는 실패의 캐시 계약. 낙관적 갱신이 만든 목록을 그대로 두면 비로그인
  // 화면에 채워진 하트로 남는다(비활성 쿼리라 무효화로도 지워지지 않는다).
  // 하트가 방향 미확정이면 비활성이라 UI 로는 이 경로에 닿지 못한다 — 그래도 뮤테이션의 보장은
  // 남겨 둔다. 게이트가 무너지면 되살아나는 사고라 훅 계약 수준에서 고정한다.
  it('이전 값 없이 실패한 토글은 낙관적 갱신을 캐시에 남기지 않는다', async () => {
    setAuthStatus('authenticated');
    server.use(...expiredSession('/me/favorites/7'));

    latestQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useFavoriteToggleMutation(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ clubId: 7, isFavorited: false }).catch(() => {});
    });

    expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toBeUndefined();
  });

  // 세션 종료가 확정되면 만료 핸들러가 캐시 전체를 비운다(공용 단말 정보 노출 방지). 그 직후
  // 표면화되는 401 의 낙관적 롤백이 이전 값을 복원하면, 방금 비운 캐시에 이전 사용자의 찜
  // 목록이 되살아난다 — 미인증이면 비활성 쿼리라 invalidate 로도 지워지지 않는다.
  it('세션 종료가 확정된 뒤의 롤백은 이전 사용자의 찜 목록을 복원하지 않는다', async () => {
    setAuthStatus('authenticated');
    server.use(
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [3] }, message: null }),
      ),
      ...expiredSession('/me/favorites/7'),
    );
    // SessionExpiryHandler 의 계약을 재현한다 — 종료 확정은 동기 setState 가 먼저, 이어서
    // 이전 사용자 데이터 클리어. 원 401 은 이 처리가 끝난 뒤에 호출자 onError 로 표면화된다.
    registerUnauthorizedHandler(() => {
      // isVerified 까지 올리는 것이 실제 핸들러의 계약이다 — 종료 "확정"의 표식이라,
      // 이게 빠지면 시드된 미인증과 구분되지 않는다.
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null });
      latestQueryClient.clear();
    });

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    // 기존 찜 목록이 로드된 뒤에 눌러야 되돌릴 이전 값(previousIds)이 생긴다.
    await waitFor(() =>
      expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toEqual({ clubIds: [3] }),
    );
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalled());
    expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toBeUndefined();
  });

  // 미인증에서는 클릭이 "로그인으로 이동" 이라 방향과 무관하다 — 목록이 없다고 막으면
  // 로그인 진입점이 사라진다.
  it('미인증이면 목록 없이도 눌러지고 요청 없이 즉시 로그인으로 보낸다', async () => {
    setAuthStatus('unauthenticated');
    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    const heart = screen.getByRole('button', { name: '찜 추가' });
    expect(heart).toBeEnabled();
    await userEvent.click(heart);

    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2F');
    expect(requestedPaths).toHaveLength(0);
  });
});

describe('useClubApply — 시드된 인증의 지원 클릭은 로그인으로 튕기지 않는다', () => {
  const recruitment: StudentRecruitmentProjection = {
    id: 3,
    title: '모집',
    startDate: '2026-01-01',
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

  // 시드된 인증은 아직 서버로 확인되지 않았다 — 그래도 미인증으로 단정하지 않고 그대로 물어본다.
  // 만료된 access 는 API 계층이 갱신하고, 정말 미인증이면 401 로 답이 온다.
  it('시드된 인증이면 지원 자격 확인을 거쳐 지원 페이지로 이동한다', async () => {
    setAuthStatus('authenticated');
    server.use(
      http.get(`${BASE}/recruitments/3/applications/eligibility`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(requestedPaths).toContain('/api/v1/recruitments/3/applications/eligibility');
    expect(mockRouterPush).toHaveBeenCalledWith('/apply/3');
  });

  it('시드된 인증의 클릭이 401 로 돌아오면 요청을 보낸 뒤 로그인으로 보낸다', async () => {
    setAuthStatus('authenticated');
    server.use(...expiredSession('/recruitments/3/applications/eligibility'));

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(requestedPaths).toContain('/api/v1/recruitments/3/applications/eligibility');
    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2Fapply%2F3');
  });

  it('미인증이 확정되면 자격 확인 없이 즉시 로그인으로 보낸다', async () => {
    setAuthStatus('unauthenticated');
    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2Fapply%2F3');
    expect(requestedPaths).toHaveLength(0);
  });
});
