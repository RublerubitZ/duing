import { Component, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { ProfileCheckStatus, User } from '@duing/types';

import {
  loadProfileEditDialog,
  ProfileCheckPrompt,
  ProfileEditDialogUnavailable,
} from '@/app/_components/ProfileCheckPrompt';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

/**
 * 정보 확인 팝업의 수정 창(ProfileEditDialog) 청크를 받지 못할 때 — 불안정한 모바일망·배포 직후 오래된 탭의 ChunkLoadError.
 * 운영 App Router 빌드는 next/dynamic 을 React.lazy 구현(app-dynamic)으로 바꿔 끼워 import 실패가 렌더 중 throw 된다.
 * vitest 의 Node 해석은 실패를 삼키는 옛 Pages 로더를 집으므로 운영과 같은 구현으로 바꿔 끼운다.
 */
vi.mock('next/dynamic', async () => {
  const appDynamicModule = await import('next/dist/shared/lib/app-dynamic');
  return { default: appDynamicModule.default };
});
vi.mock('@/app/_components/ProfileEditDialog', () => {
  throw new Error('Loading chunk app/_components/ProfileEditDialog failed.');
});

const BASE = 'http://localhost:8080/api/v1';
const TITLE = '새 학기, 내 정보를 확인해 주세요.';
const LOAD_FAILED_MESSAGE = '수정 화면을 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const me: User = {
  id: 7001,
  studentId: '20247001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'SOPHOMORE',
  role: 'STUDENT',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
};
const pendingStatus: ProfileCheckStatus = {
  pending: true,
  semesterYear: 2026,
  semesterTerm: 1,
  title: TITLE,
  message: '현재 등록된 학년과 전공이 올바른지 확인해 주세요.',
  grade: 'SOPHOMORE',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
  suggestedGrade: 'JUNIOR',
};

// 홈(/)은 세그먼트 오류 경계가 없어 global-error 가, /me 는 app/me/error.tsx 가 페이지를 통째로 바꾼다 — 그 자리를 흉내 낸다.
class PageErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  override render() {
    return this.state.crashed ? <p>페이지 오류 화면</p> : this.props.children;
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterAll(() => server.close());

describe('loadProfileEditDialog', () => {
  it('import 가 실패해도 reject 하지 않고 같은 props 를 받는 대체 컴포넌트로 끝난다', async () => {
    await expect(
      loadProfileEditDialog(() => Promise.reject(new Error('Loading chunk failed.'))),
    ).resolves.toBe(ProfileEditDialogUnavailable);
  });
});

describe('ProfileEditDialogUnavailable', () => {
  it('닫힌 채로는 아무것도 하지 않고, 열리면 새로고침을 안내한 뒤 onClose 를 한 번 불러 팝업으로 돌아간다', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ToastProvider>
        <ProfileEditDialogUnavailable open={false} onClose={onClose} currentName="홍길동" currentGrade="SOPHOMORE" />
      </ToastProvider>,
    );
    // 팝업은 띄우기로 정한 순간부터 수정 창을 닫힌 채 그려 둔다 — 그때는 조용해야 한다.
    expect(screen.queryByText(LOAD_FAILED_MESSAGE)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <ToastProvider>
        <ProfileEditDialogUnavailable open onClose={onClose} currentName="홍길동" currentGrade="SOPHOMORE" />
      </ToastProvider>,
    );

    expect(screen.getByText(LOAD_FAILED_MESSAGE)).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileCheckPrompt — 수정 창 청크를 받지 못할 때(운영 next/dynamic 경로)', () => {
  it('페이지와 팝업은 그대로 두고, 정보 수정하기를 누르면 새로고침을 안내한 뒤 팝업으로 돌아온다', async () => {
    server.use(
      http.get(`${BASE}/users/me`, () => HttpResponse.json({ ok: true, data: me, message: null })),
      http.get(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json({ ok: true, data: pendingStatus, message: null }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <PageErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ApiClientProvider client={apiClient}>
            <ToastProvider>
              <main>홈 화면</main>
              <ProfileCheckPrompt />
            </ToastProvider>
          </ApiClientProvider>
        </QueryClientProvider>
      </PageErrorBoundary>,
    );
    const popup = await screen.findByRole('dialog', { name: TITLE });
    // 닫힌 채 미리 그려 둔 수정 창이 청크를 받다 실패할 때까지 기다린다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByText('페이지 오류 화면')).toBeNull();

    await user.click(within(popup).getByRole('button', { name: '정보 수정하기' }));

    expect(await screen.findByText(LOAD_FAILED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '프로필 수정' })).toBeNull();
    expect(screen.getByText('홈 화면')).toBeInTheDocument();
  });
});
