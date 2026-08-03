import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { MyClubMembership } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

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

  it('서버 오류(500)는 접근 거부가 아니므로 리다이렉트하지 않는다', async () => {
    seedMembership(() => new HttpResponse(null, { status: 500 }));

    renderGuard();

    await waitFor(() => expect(alertSpy).not.toHaveBeenCalled());
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
