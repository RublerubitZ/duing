import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { MyClubMembership } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubMembershipKeys } from '@duing/hooks';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/clubs/1/member',
  useSearchParams: () => new URLSearchParams(),
}));

import { MemberAccessGuard } from '@/app/clubs/[clubId]/member/_components/MemberAccessGuard';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const membership: MyClubMembership = {
  role: 'MEMBER',
  joinedAt: '2026-03-01T00:00:00Z',
  permissions: {
    canPostNotice: false,
    canEditNotice: false,
    canDeleteNotice: false,
    canPostEvent: false,
    canEditEvent: false,
    canDeleteEvent: false,
  },
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  replaceMock.mockClear();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
});

function seedMembership(response: () => Response) {
  server.use(http.get(`*/clubs/${CLUB_ID}/membership`, response));
}

function renderGuard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <MemberAccessGuard clubId={CLUB_ID}>
          <p>회원 전용 콘텐츠</p>
        </MemberAccessGuard>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('MemberAccessGuard', () => {
  it('멤버는 회원 전용 콘텐츠를 그대로 볼 수 있다', async () => {
    seedMembership(() => HttpResponse.json({ ok: true, message: null, data: membership }));

    renderGuard();

    expect(await screen.findByText('회원 전용 콘텐츠')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('비멤버(200 + data:null)는 안내 후 동아리 소개 페이지로 이동한다', async () => {
    seedMembership(() => HttpResponse.json({ ok: true, message: null, data: null }));

    renderGuard();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/clubs/${CLUB_ID}`));
    expect(alertSpy).toHaveBeenCalledWith(
      '회원 전용 페이지입니다. 동아리 소개 페이지로 이동합니다.',
    );
    expect(screen.queryByText('회원 전용 콘텐츠')).not.toBeInTheDocument();
  });

  it('403 응답에 서버 사유가 있으면 기본 문구 대신 그 사유를 노출한다', async () => {
    seedMembership(() =>
      HttpResponse.json(
        { ok: false, message: '운영 종료된 동아리입니다.', data: null },
        { status: 403 },
      ),
    );

    renderGuard();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/clubs/${CLUB_ID}`));
    expect(alertSpy).toHaveBeenCalledWith(
      '운영 종료된 동아리입니다. 동아리 소개 페이지로 이동합니다.',
    );
  });

  it('403 본문을 해석할 수 없으면 합성 폴백 문구 대신 기본 안내를 쓴다', async () => {
    seedMembership(() => new HttpResponse('<html>forbidden</html>', { status: 403 }));

    renderGuard();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/clubs/${CLUB_ID}`));
    expect(alertSpy).toHaveBeenCalledWith(
      '회원 전용 페이지입니다. 동아리 소개 페이지로 이동합니다.',
    );
  });

  it('서버 오류(500)는 거부가 아니므로 리다이렉트 대신 실패 안내를 보여준다', async () => {
    seedMembership(() => new HttpResponse(null, { status: 500 }));

    renderGuard();

    // 쿼리가 정착(재시도 소진)할 때까지 기다린 뒤 단언한다 — 훅이 자체 retry 옵션을 갖고 있어
    // QueryClient 의 retry:false 가 덮이지 않으므로, 기다리지 않으면 첫 응답 전에 통과해버린다.
    expect(await screen.findByText(/권한 정보를 불러오지 못했습니다/, {}, { timeout: 5000 }))
      .toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('회원 전용 콘텐츠')).not.toBeInTheDocument();
  });

  it('판정 전에는 회원 전용 콘텐츠 대신 권한 확인 상태를 보여준다', async () => {
    seedMembership(() => HttpResponse.json({ ok: true, message: null, data: membership }));

    renderGuard();

    // 로딩 라벨은 텍스트가 아니라 aria-label 이다(레포 로딩 UI 컨벤션 — 텍스트 로딩 금지).
    expect(screen.getByRole('status', { name: '권한 확인 중' })).toBeInTheDocument();
    expect(screen.queryByText('회원 전용 콘텐츠')).not.toBeInTheDocument();
    // 이후 정상 진입까지 확인해 로딩이 영구 상태로 남지 않는 것도 함께 고정한다.
    expect(await screen.findByText('회원 전용 콘텐츠')).toBeInTheDocument();
  });

  it('캐시된 멤버십이 남아 있어도 재조회가 403 이면 회원 화면을 유지하지 않는다', async () => {
    // React Query 는 재조회 실패 시 마지막 성공 data 를 남긴다. 멤버로 진입한 뒤 동아리가 폐쇄되면
    // 그 캐시 때문에 멤버 화면이 계속 렌더되던 경로를 고정한다.
    seedMembership(() =>
      HttpResponse.json(
        { ok: false, message: '운영 종료된 동아리입니다.', data: null },
        { status: 403 },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // updatedAt 을 과거로 박아 staleTime(5분)을 넘긴 상태로 만든다 → 마운트 시 재조회.
    queryClient.setQueryData(clubMembershipKeys.byClub(CLUB_ID), membership, { updatedAt: 1 });

    render(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <MemberAccessGuard clubId={CLUB_ID}>
            <p>회원 전용 콘텐츠</p>
          </MemberAccessGuard>
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/clubs/${CLUB_ID}`));
    expect(alertSpy).toHaveBeenCalledWith(
      '운영 종료된 동아리입니다. 동아리 소개 페이지로 이동합니다.',
    );
    expect(screen.queryByText('회원 전용 콘텐츠')).not.toBeInTheDocument();
  });
});
