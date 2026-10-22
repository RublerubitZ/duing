import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, userQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { Grade, ProfileCheckStatus, User } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
// 목록 훅만 스텁한다 — 내 정보·정보 확인 상태·프로필 저장은 실제 훅이 MSW 로 받는다(TanStack Query 는 모킹하지 않는다).
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useMyApplicationsQuery: () => ({ data: [] }),
  useMyClubsQuery: () => ({ data: [] }),
  useFavoriteListQuery: () => ({ data: { content: [] } }),
  useLogout: () => vi.fn(),
}));
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => null }));
vi.mock('@/app/me/_components/MyPageHeader', () => ({ MyPageHeader: () => null }));
vi.mock('@/components/duing/Sparkle', () => ({ SparkleFull: () => null }));
vi.mock('@/app/me/settings/_components/PasswordChangeDialog', () => ({ PasswordChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/PhoneChangeDialog', () => ({ PhoneChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/WithdrawAccountDialog', () => ({ WithdrawAccountDialog: () => null }));
vi.mock('@/app/me/settings/_components/SessionListCard', () => ({ SessionListCard: () => null }));

import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

/**
 * 설정 화면의 프로필 수정 창도 정보 확인 대기 중이면 제안 학년으로 채운다(스펙 §3.3) — 실제 수정 창 + 실제 ApiClient + MSW.
 * 현재 학년은 2학년(SOPHOMORE)이다.
 */
const BASE = 'http://localhost:8080/api/v1';
const GRADE_HINT = '새 학기 학년으로 채웠어요. 다르면 바꿔 주세요.';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const me: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'SOPHOMORE',
  role: 'STUDENT',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
};

function pendingStatus(suggestedGrade: Grade | null): ProfileCheckStatus {
  return {
    pending: true,
    semesterYear: 2026,
    semesterTerm: 1,
    title: '새 학기, 내 정보를 확인해 주세요.',
    message: '현재 등록된 학년과 전공 및 재학 상태가 올바른지 확인해 주세요.',
    grade: 'SOPHOMORE',
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
    suggestedGrade,
  };
}

function serve(status: ProfileCheckStatus) {
  server.use(
    http.get(`${BASE}/users/me`, () => HttpResponse.json({ ok: true, data: me, message: null })),
    http.get(`${BASE}/users/me/profile-check`, () => HttpResponse.json({ ok: true, data: status, message: null })),
  );
}

// 상태 조회 응답을 붙잡아 둔다 — 돌려준 함수를 부르기 전까지 응답하지 않는다.
function holdStatusResponse(status: ProfileCheckStatus) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get(`${BASE}/users/me/profile-check`, async () => {
      await gate;
      return HttpResponse.json({ ok: true, data: status, message: null });
    }),
  );
  return release;
}

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

// 정보 확인 상태는 화면에 보이지 않는다 — 조회가 끝나(다시 받는 중도 아님) 캐시에 결과가 앉을 때까지 기다린다.
async function waitForProfileCheck(queryClient: QueryClient, status: 'success' | 'error') {
  await waitFor(() => {
    const state = queryClient.getQueryState(userQueryKeys.profileCheck());
    expect(state?.status).toBe(status);
    expect(state?.fetchStatus).toBe('idle');
  });
}

async function openProfileEdit(user: ReturnType<typeof userEvent.setup>) {
  const editButton = screen.getByRole('button', { name: '수정' });
  // 내 정보가 오기 전에는 비활성이다.
  await waitFor(() => expect(editButton).toBeEnabled());
  await user.click(editButton);
  return screen.findByRole('dialog', { name: '프로필 수정' });
}

function expectCurrentGradeWithoutHint(editDialog: HTMLElement) {
  const gradeSelect = within(editDialog).getByLabelText('학년');
  expect(gradeSelect).toHaveValue('SOPHOMORE');
  expect(gradeSelect).not.toHaveAttribute('aria-describedby');
  expect(within(editDialog).queryByText(GRADE_HINT)).toBeNull();
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
});
afterEach(() => {
  // 아래 로그인 상태 초기화가 마운트된 화면을 act 밖에서 다시 그리지 않게 먼저 언마운트한다.
  cleanup();
  server.resetHandlers();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterAll(() => server.close());

describe('SettingsPage — 프로필 수정 창의 학년', () => {
  it('정보 확인 대기 중이고 제안 학년이 있으면 설정의 수정 창이 제안 학년으로 열리고 안내를 보인다', async () => {
    serve(pendingStatus('JUNIOR'));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    const editDialog = await openProfileEdit(user);

    const gradeSelect = within(editDialog).getByLabelText('학년');
    expect(gradeSelect).toHaveValue('JUNIOR');
    const hint = within(editDialog).getByText(GRADE_HINT);
    expect(gradeSelect).toHaveAttribute('aria-describedby', hint.id);
  });

  it('확인 대기 중이어도 제안이 없으면 현재 학년으로 열리고 안내가 없다', async () => {
    serve(pendingStatus(null));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    expectCurrentGradeWithoutHint(await openProfileEdit(user));
  });

  it('확인 대기 중 제안 학년이 현재 학년과 같으면 현재 학년으로 열리고 안내가 없다', async () => {
    serve(pendingStatus('SOPHOMORE'));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    expectCurrentGradeWithoutHint(await openProfileEdit(user));
  });

  it('수정 창을 닫았다가 다시 열 때 시드를 그 순간 상태로 다시 정한다', async () => {
    serve(pendingStatus('JUNIOR'));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    const firstDialog = await openProfileEdit(user);
    expect(within(firstDialog).getByLabelText('학년')).toHaveValue('JUNIOR');
    expect(within(firstDialog).getByText(GRADE_HINT)).toBeInTheDocument();
    await user.click(within(firstDialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '프로필 수정' })).toBeNull());

    // 닫힌 사이 다른 곳에서 확인돼 꺼졌다 — 다시 열 때는 지난번 시드가 아니라 지금 상태를 따른다.
    serve({ pending: false });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    });
    await waitForProfileCheck(queryClient, 'success');
    expect(queryClient.getQueryData(userQueryKeys.profileCheck())).toEqual({ pending: false });

    expectCurrentGradeWithoutHint(await openProfileEdit(user));
  });

  it('팝업이 꺼져 있으면(pending:false) 현재 학년으로 열리고 안내가 없다', async () => {
    serve({ pending: false });
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    expectCurrentGradeWithoutHint(await openProfileEdit(user));
  });

  it('상태 조회가 실패하면 현재 학년으로 연다 — 실패해도 남는 옛 확인 대기 캐시는 믿지 않는다', async () => {
    serve(pendingStatus('JUNIOR'));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    // 다시 받다 404(BE 롤백 중 등 — 훅은 404 를 재시도하지 않는다).
    server.use(
      http.get(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json({ ok: false, data: null, message: '찾을 수 없습니다.' }, { status: 404 }),
      ),
    );
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    });
    await waitForProfileCheck(queryClient, 'error');
    // TanStack 은 실패해도 옛 data 를 남긴다 — 이 pending:true 로 채우면 안 된다.
    expect(queryClient.getQueryData(userQueryKeys.profileCheck())).toEqual(pendingStatus('JUNIOR'));

    expectCurrentGradeWithoutHint(await openProfileEdit(user));
  });

  it('상태 조회가 끝나기 전에 연 수정 창은 조회가 도착해도 학년과 입력 중이던 이름·전공이 그대로다', async () => {
    serve(pendingStatus('JUNIOR'));
    // 늦게 오는 응답은 확인 대기 + 제안이다 — pending:false 로 붙잡으면 시드를 렌더마다 다시 정하는 구현도 통과한다.
    const releaseStatus = holdStatusResponse(pendingStatus('JUNIOR'));
    const user = userEvent.setup();
    const queryClient = renderSettings();

    const editDialog = await openProfileEdit(user);
    expect(queryClient.getQueryState(userQueryKeys.profileCheck())?.status).toBe('pending');
    const nameInput = within(editDialog).getByDisplayValue('홍길동');
    await user.clear(nameInput);
    await user.type(nameInput, '김두잉');
    const majorInput = within(editDialog).getByDisplayValue('컴퓨터정보공학부');
    await user.clear(majorInput);
    await user.type(majorInput, '경영학과');

    await act(async () => {
      releaseStatus();
    });
    await waitForProfileCheck(queryClient, 'success');

    expect(within(editDialog).getByLabelText('학년')).toHaveValue('SOPHOMORE');
    expect(nameInput).toHaveValue('김두잉');
    expect(majorInput).toHaveValue('경영학과');
    expect(within(editDialog).queryByText(GRADE_HINT)).toBeNull();
  });

  it('방금 저장해 다시 받는 중인 남은 확인 대기 상태로는 채우지 않는다', async () => {
    serve(pendingStatus('JUNIOR'));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    await waitForProfileCheck(queryClient, 'success');

    // 프로필 저장(me 접두 무효화)으로 다시 받는 중 — 서버는 이미 이 학기를 확인으로 기록해 pending:false 를 줄 참이다.
    const releaseStatus = holdStatusResponse({ pending: false });
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    });
    expect(queryClient.getQueryState(userQueryKeys.profileCheck())?.fetchStatus).toBe('fetching');

    expectCurrentGradeWithoutHint(await openProfileEdit(user));

    await act(async () => {
      releaseStatus();
    });
    await waitForProfileCheck(queryClient, 'success');
  });
});
