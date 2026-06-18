import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { LeaveClubDialog } from '@/app/me/_components/LeaveClubDialog';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB = { clubId: 7, clubName: 'OO동아리' };
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDialog(onClose: () => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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
      <LeaveClubDialog club={CLUB} onClose={onClose} />
    </Wrapper>,
  );
}

describe('LeaveClubDialog — 동아리명 확인 후 탈퇴', () => {
  it('동아리명을 입력하기 전에는 "동아리 탈퇴" 버튼이 비활성이다', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: '동아리 탈퇴' })).toBeDisabled();
  });

  it('동아리명이 일치하지 않으면 버튼이 비활성이고 불일치 안내를 노출한다', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('탈퇴 확인 동아리명 입력'), '다른이름');

    expect(screen.getByText('동아리명이 일치하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동아리 탈퇴' })).toBeDisabled();
  });

  it('동아리명이 정확히 일치하면 탈퇴가 실행되고 성공 시 onClose 가 호출된다', async () => {
    let deleteHit = false;
    server.use(
      http.delete(`*/clubs/${CLUB.clubId}/members/me`, () => {
        deleteHit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(onClose);

    await user.type(screen.getByLabelText('탈퇴 확인 동아리명 입력'), CLUB.clubName);
    const confirmButton = screen.getByRole('button', { name: '동아리 탈퇴' });
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => expect(deleteHit).toBe(true));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('앞뒤 공백은 trim 되어 동아리명이 일치 처리된다', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('탈퇴 확인 동아리명 입력'), `  ${CLUB.clubName}  `);

    expect(screen.queryByText('동아리명이 일치하지 않습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동아리 탈퇴' })).toBeEnabled();
  });
});
