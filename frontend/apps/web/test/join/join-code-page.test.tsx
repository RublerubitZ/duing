import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { JoinCodeCheck } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import JoinCodePage from '@/app/join/[code]/page';

const CODE = 'ABCD1234';
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

function check(overrides: Partial<JoinCodeCheck> = {}): JoinCodeCheck {
  return {
    clubId: 7,
    clubName: '두잉 개발동아리',
    generation: 12,
    usable: true,
    alreadyMember: false,
    myRequestStatus: null,
    linkType: 'RECRUITMENT',
    autoApprove: false,
    ...overrides,
  };
}

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  mockAddToast.mockClear();
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다(manage 테스트 동일 패턴).
  const paramsValue = { code: CODE };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <JoinCodePage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

function signIn() {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 1,
      studentId: '20240001',
      name: '홍길동',
      phone: '010-1234-5678',
      grade: 'FRESHMAN',
      role: 'STUDENT',
    },
  });
}

describe('가입 링크 랜딩 — 상태 분기', () => {
  it('이미 가입한 동아리면 안내와 동아리 페이지 링크를 보여준다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () =>
        json(check({ alreadyMember: true, myRequestStatus: 'APPROVED' })),
      ),
    );
    renderPage();

    expect(await screen.findByText('이미 가입된 동아리입니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '동아리 페이지로 이동' })).toHaveAttribute(
      'href',
      '/clubs/7',
    );
    expect(screen.queryByRole('button', { name: '동아리 가입하기' })).not.toBeInTheDocument();
  });

  // 승인 게이트가 남아 있으므로 "등록되었습니다" 같은 즉시 등록 표현을 쓰면 안 된다(스펙 §6).
  it('대기 중인 요청이 있으면 신청 완료로 안내하고 즉시 등록 표현을 쓰지 않는다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () => json(check({ myRequestStatus: 'PENDING' }))),
    );
    renderPage();

    expect(await screen.findByText('🎉 가입 신청이 완료되었습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('운영진 확인 후 두잉 개발동아리 동아리 회원으로 등록됩니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/회원으로 등록되었습니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '동아리 가입하기' })).not.toBeInTheDocument();
    // 대기 화면에서 할 수 있는 일이 없으므로 나갈 길을 반드시 준다.
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
  });

  it('가입 가능한 링크면 합격 축하와 소요 시간을 안내한다', async () => {
    signIn();
    server.use(http.get(`*/join-codes/${CODE}`, () => json(check())));
    renderPage();

    expect(
      await screen.findByText(
        /🎉 축하합니다! 두잉 개발동아리 최종 합격을 축하드립니다\. 가입은 약 30초 정도 소요됩니다\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동아리 가입하기' })).toBeInTheDocument();
  });

  it('거절 이력이 있어도 다시 가입 요청할 수 있다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () => json(check({ myRequestStatus: 'REJECTED' }))),
    );
    renderPage();

    expect(await screen.findByRole('button', { name: '동아리 가입하기' })).toBeInTheDocument();
  });

  // 탈퇴한 회원은 alreadyMember=false 인데 과거 승인 이력이 남는다 — 이걸 종결 화면으로 취급하면
  // 재가입이 프론트에서 영구히 막힌다.
  it('탈퇴 후 승인 이력만 남은 경우에도 가입 요청 버튼을 보여준다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () =>
        json(check({ alreadyMember: false, myRequestStatus: 'APPROVED' })),
      ),
    );
    renderPage();

    expect(await screen.findByRole('button', { name: '동아리 가입하기' })).toBeInTheDocument();
    expect(screen.queryByText('이미 가입된 동아리입니다')).not.toBeInTheDocument();
  });

  it('비로그인이면 동아리 정보와 함께 next 를 붙인 로그인 링크를 보여준다', async () => {
    server.use(
      http.get(`*/join-codes/${CODE}`, () =>
        json(check({ alreadyMember: null, myRequestStatus: null })),
      ),
    );
    renderPage();

    const loginLink = await screen.findByRole('link', { name: '로그인하고 가입하기' });
    expect(loginLink).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/join/${CODE}`)}`);
    expect(screen.getByText('두잉 개발동아리')).toBeInTheDocument();
  });

  it('없는 코드(404)면 사유 없이 유효하지 않다고만 안내한다', async () => {
    server.use(
      http.get(`*/join-codes/${CODE}`, () =>
        HttpResponse.json({ ok: false, message: '유효하지 않은 가입 링크입니다.', data: null }, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByText('유효하지 않은 가입 링크입니다')).toBeInTheDocument();
    expect(screen.getByText('링크가 아직 유효한지 동아리에 확인해 주세요.')).toBeInTheDocument();
  });

  it('사용할 수 없는 코드도 같은 문구로 안내한다', async () => {
    signIn();
    server.use(http.get(`*/join-codes/${CODE}`, () => json(check({ usable: false }))));
    renderPage();

    expect(await screen.findByText('유효하지 않은 가입 링크입니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '동아리 가입하기' })).not.toBeInTheDocument();
  });

  // 코드가 만료된 뒤 링크를 다시 연 회원에게 코드 문구만 보여주면 정작 알아야 할 자기 상태를
  // 확인할 수 없다 — 가입·요청 상태가 코드 사용 가능 여부보다 우선한다(스펙 6).
  it('코드가 만료돼도 이미 가입한 회원에게는 가입 상태를 먼저 알려준다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () => json(check({ usable: false, alreadyMember: true }))),
    );
    renderPage();

    expect(await screen.findByText('이미 가입된 동아리입니다')).toBeInTheDocument();
    expect(screen.queryByText('유효하지 않은 가입 링크입니다')).not.toBeInTheDocument();
  });
});

describe('가입 링크 랜딩 — 가입 신청', () => {
  it('신청에 성공하면 토스트를 띄우고 신청 완료 화면으로 바뀐다', async () => {
    signIn();
    let requested = false;
    server.use(
      http.get(`*/join-codes/${CODE}`, () =>
        json(check({ myRequestStatus: requested ? 'PENDING' : null })),
      ),
      http.post(`*/join-codes/${CODE}/requests`, () => {
        requested = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '동아리 가입하기' }));

    expect(await screen.findByText('🎉 가입 신청이 완료되었습니다.')).toBeInTheDocument();
    expect(mockAddToast).toHaveBeenCalledWith('가입 신청을 보냈어요. 승인되면 알려드릴게요.');
  });

  it('요청이 409로 거절되면 서버가 준 사유를 그대로 토스트로 보여준다', async () => {
    signIn();
    server.use(
      http.get(`*/join-codes/${CODE}`, () => json(check())),
      http.post(`*/join-codes/${CODE}/requests`, () =>
        HttpResponse.json(
          { ok: false, message: '이미 대기 중인 가입 요청이 있습니다.', data: null },
          { status: 409 },
        ),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '동아리 가입하기' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('이미 대기 중인 가입 요청이 있습니다.', {
        variant: 'error',
      }),
    );
  });
});
