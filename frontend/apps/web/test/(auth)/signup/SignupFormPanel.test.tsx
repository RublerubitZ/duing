import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

// next/navigation.useRouter 를 모킹해 가입 성공 후 replace 인자를 검증한다(apply-page.test 선례).
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// next/navigation 모킹 팩토리가 mockRouterReplace 초기화 이후 실행되도록 패널 import 를 아래에 둔다.
import { SignupFormPanel } from '@/app/(auth)/signup/_components/SignupFormPanel';

// MSW 기반 통합 테스트 — use-phone-verification.test 와 동일한 provider/stub-client 패턴.
// 시간 의존(폴링)은 fake timers 로 결정적으로 몰고, DOM 조작은 fireEvent 로 한다.
// (userEvent 는 vitest fake timers 아래에서 click 프라미스가 해소되지 않아 사용하지 않는다 —
//  대신 훅 테스트와 동일하게 advanceTimersByTimeAsync 로 React Query 폴링만 수동 진행한다.)
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockRouterReplace.mockReset();
  vi.useRealTimers();
});
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// use-phone-verification.test 의 세션 픽스처와 동일 shape.
const SESSION_FIXTURE = {
  verificationToken: 'verification-token-abc',
  code: '7K3M9PXQ',
  moNumber: '16663538',
  qrCode: null as string | null,
  expiresAt: '2026-07-10T12:05:00',
  expiresInSeconds: 300,
};

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel() {
  const queryClient = newQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(<SignupFormPanel />, { wrapper: Wrapper });
}

function mockIssue() {
  server.use(
    http.post('*/auth/phone-verifications', () =>
      HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null }),
    ),
  );
}

// 발급→문자수신→폴링 VERIFIED→[다음] 까지 몰아 Step2 로 진입시키는 헬퍼(fake timers 전제).
// use-phone-verification.test 의 폴링 시나리오(pollCount<2 이면 PENDING, 이후 VERIFIED)를 재현한다.
async function issueVerifyAndAdvance() {
  mockIssue();
  let pollCount = 0;
  server.use(
    http.post('*/auth/phone-verifications/status', () => {
      pollCount += 1;
      return HttpResponse.json({
        ok: true,
        data: {
          status: pollCount < 2 ? 'PENDING' : 'VERIFIED',
          expiresInSeconds: 290,
          maskedPhone: '010-****-5678',
        },
        message: null,
      });
    }),
  );

  // 번호 입력(포맷 입력은 단발 change 로 결정적으로 넣는다) → 인증 시작 → 발급 응답 반영(issued)
  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  fireEvent.click(screen.getByRole('button', { name: '인증 시작' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  // 문자를 보냈어요 → waiting → 즉시 폴링(PENDING) → 3초 재폴링(VERIFIED)
  fireEvent.click(screen.getByRole('button', { name: '문자를 보냈어요' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });

  // 인증 완료 → [다음] 으로 Step2 진입
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

describe('SignupFormPanel — 2-step 오케스트레이터', () => {
  it('처음에는 Step1(휴대폰 인증)만 보이고 기본정보 필드는 없다', () => {
    renderPanel();

    // 스텝 인디케이터 ①②
    expect(screen.getByText('① 휴대폰 인증')).toBeInTheDocument();
    expect(screen.getByText('② 기본 정보')).toBeInTheDocument();
    // Step1 의 휴대폰 번호 입력은 있고, Step2 의 이름/학번 필드는 없다.
    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument();
  });

  it('인증 전에는 다음 버튼이 없어 Step2로 못 넘어간다', () => {
    renderPanel();

    // [다음] 은 SignupStepVerify 가 verification.verified 일 때만 렌더 → 미인증엔 존재하지 않는다.
    expect(screen.queryByRole('button', { name: /다음/ })).not.toBeInTheDocument();
    // 따라서 Step2 의 기본정보 필드에도 도달할 수 없다.
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
  });

  it('발급→문자수신→VERIFIED 후 다음을 누르면 Step2(기본정보)가 보인다', async () => {
    vi.useFakeTimers();
    renderPanel();

    await issueVerifyAndAdvance();

    expect(screen.getByLabelText('이름')).toBeInTheDocument();
    expect(screen.getByLabelText('학번')).toBeInTheDocument();
    expect(screen.getByText('약관에 모두 동의합니다')).toBeInTheDocument();
    // Step1(휴대폰 번호 입력)은 사라진다.
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
  });

  it('Step2에서 이전을 누르면 Step1로 돌아가고 인증 상태가 보존된다', async () => {
    vi.useFakeTimers();
    renderPanel();

    await issueVerifyAndAdvance();
    expect(screen.getByLabelText('이름')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /이전/ }));

    // Step1 verified 뷰: ✓ 인증 완료 + [다음] 재노출, 기본정보 필드는 사라진다.
    expect(screen.getByText(/이 번호로 인증됐어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다음/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
  });

  it('Step2에서 유효 입력 후 가입하면 signup 이 verificationToken 을 포함해 호출된다', async () => {
    vi.useFakeTimers();
    renderPanel();

    await issueVerifyAndAdvance();

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '김도윤' } });
    fireEvent.change(screen.getByLabelText('학번'), { target: { value: '20240001' } });
    fireEvent.change(screen.getByLabelText('학번 확인'), { target: { value: '20240001' } });
    fireEvent.change(screen.getByLabelText('학년'), { target: { value: 'FRESHMAN' } });
    fireEvent.change(screen.getByLabelText(/단과대학/), { target: { value: 'IT_ENGINEERING' } });
    fireEvent.change(screen.getByPlaceholderText(/학과명 입력/), { target: { value: '컴퓨터정보공학부' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'duing1234!' } });
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'duing1234!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '약관에 모두 동의합니다' }));

    let capturedSignupBody: unknown = null;
    server.use(
      http.post('*/auth/signup', async ({ request }) => {
        capturedSignupBody = await request.json();
        return HttpResponse.json({ ok: true, data: 1, message: null });
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /가입하고 두잉 시작하기/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(capturedSignupBody).toEqual({
      studentId: '20240001',
      name: '김도윤',
      password: 'duing1234!',
      grade: 'FRESHMAN',
      college: 'IT_ENGINEERING',
      major: '컴퓨터정보공학부',
      verificationToken: 'verification-token-abc',
      termsOfServiceAgreed: true,
      privacyPolicyAgreed: true,
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/login?next=/me');
  });

  it('가입이 403(PHONE_NOT_VERIFIED)로 실패하면 인증을 리셋하고 Step1로 복귀한다', async () => {
    vi.useFakeTimers();
    renderPanel();

    await issueVerifyAndAdvance();

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '김도윤' } });
    fireEvent.change(screen.getByLabelText('학번'), { target: { value: '20240001' } });
    fireEvent.change(screen.getByLabelText('학번 확인'), { target: { value: '20240001' } });
    fireEvent.change(screen.getByLabelText('학년'), { target: { value: 'FRESHMAN' } });
    fireEvent.change(screen.getByLabelText(/단과대학/), { target: { value: 'IT_ENGINEERING' } });
    fireEvent.change(screen.getByPlaceholderText(/학과명 입력/), { target: { value: '컴퓨터정보공학부' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'duing1234!' } });
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'duing1234!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '약관에 모두 동의합니다' }));

    // 서버가 세션 만료를 이유로 403(PHONE_NOT_VERIFIED)을 반환한다 — toApiError 가 body.code 를 ApiError.code 로 읽는다.
    server.use(
      http.post('*/auth/signup', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '휴대폰 인증이 만료됐어요.', code: 'PHONE_NOT_VERIFIED' },
          { status: 403 },
        ),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /가입하고 두잉 시작하기/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 복구: 만료 안내 배너가 뜨고 Step1 로 돌아간다.
    expect(screen.getByText(/휴대폰 인증이 만료됐어요/)).toBeInTheDocument();
    // Step2(기본정보) 필드는 사라진다 → 다시 Step1.
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
    // reset() 이 세션을 비워 verified 배지도 사라진다(미인증 번호 입력 뷰로 복귀).
    expect(screen.queryByText(/이 번호로 인증됐어요/)).not.toBeInTheDocument();
    // 실패 시 리다이렉트는 없다.
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
