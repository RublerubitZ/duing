import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubSummary, PageResponse } from '@duing/types';

import { AdminClubsListPage } from '@/app/admin/clubs/_pages/AdminClubsListPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/clubs',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

// 운영 중단 동아리 한 행에 네 창의 여는 버튼(중앙 지정·확보 지정·재활성·삭제)이 모두 있다. 미결 건수는 없어 정리 버튼은 없다.
const INACTIVE_CLUB: AdminClubSummary = {
  id: 11, name: '쉬는 동아리', category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'INACTIVE', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null,
  statusChangedAt: null, statusChangedByName: null,
};
const CLUBS_PAGE: PageResponse<AdminClubSummary> = {
  content: [INACTIVE_CLUB], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false,
};

let listRequestCount = 0;
let confirmRequestCount = 0;
const server = setupServer(
  http.get('*/admin/clubs', () => {
    listRequestCount += 1;
    return HttpResponse.json({ ok: true, message: null, data: CLUBS_PAGE });
  }),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  listRequestCount = 0;
  confirmRequestCount = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminClubsListPage />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;
type ConfirmDialogCase = {
  dialogName: string;
  method: 'patch' | 'post';
  path: string;
  openButtonName: string;
  confirmButtonName: string;
  // 확정 버튼을 누를 수 있게 창 안의 입력을 채운다(삭제 창의 동아리명 확인).
  fillDialog?: (user: User, dialog: HTMLElement) => Promise<void>;
};

const STATUS_CHANGE_CASE: ConfirmDialogCase = {
  dialogName: '상태 변경',
  method: 'patch',
  path: `*/admin/clubs/${INACTIVE_CLUB.id}/status`,
  openButtonName: '재활성',
  confirmButtonName: '재활성',
};

const CONFIRM_DIALOG_CASES: ReadonlyArray<ConfirmDialogCase> = [
  STATUS_CHANGE_CASE,
  {
    dialogName: '폐쇄',
    method: 'post',
    path: `*/admin/clubs/${INACTIVE_CLUB.id}/close`,
    openButtonName: '삭제',
    confirmButtonName: '삭제',
    fillDialog: async (user, dialog) => {
      await user.type(within(dialog).getByLabelText('동아리명 입력 확인'), INACTIVE_CLUB.name);
    },
  },
  {
    dialogName: '중앙 지정',
    method: 'patch',
    path: `*/admin/clubs/${INACTIVE_CLUB.id}/central-club`,
    openButtonName: '중앙 지정',
    confirmButtonName: '확인',
  },
  {
    dialogName: '확보 지정',
    method: 'patch',
    path: `*/admin/clubs/${INACTIVE_CLUB.id}/facility-secured-time-target`,
    openButtonName: '확보 지정',
    confirmButtonName: '확인',
  },
];

const respondConfirm = ({ method, path }: ConfirmDialogCase, respond: () => Response) =>
  server.use(
    http[method](path, () => {
      confirmRequestCount += 1;
      return respond();
    }),
  );

async function openDialog(user: User, dialogCase: ConfirmDialogCase) {
  renderPage();
  await user.click(await screen.findByRole('button', { name: dialogCase.openButtonName }));
  const dialog = await screen.findByRole('dialog');
  await dialogCase.fillDialog?.(user, dialog);
  return { dialog, confirmButton: within(dialog).getByRole('button', { name: dialogCase.confirmButtonName }) };
}

describe('AdminClubsListPage — 확인 창 확정 연타', () => {
  it.each(CONFIRM_DIALOG_CASES)(
    '$dialogName 창에서 같은 틱에 확정을 두 번 눌러도(버튼이 막히기 전) 요청은 한 번이다',
    async (dialogCase) => {
      respondConfirm(dialogCase, () => HttpResponse.json({ ok: true, message: null, data: null }));
      const { confirmButton } = await openDialog(userEvent.setup(), dialogCase);
      // 사이에 await 이 없어 두 번째 클릭은 React 가 disabled 를 다시 그리기 전에 들어온다(실브라우저 dblclick 과 같다).
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(listRequestCount).toBeGreaterThanOrEqual(2));
      expect(confirmRequestCount).toBe(1);
    },
  );

  it('상태 변경이 실패(409)한 뒤 창에서 다시 확정하면 요청이 다시 간다', async () => {
    respondConfirm(STATUS_CHANGE_CASE, () =>
      confirmRequestCount === 1
        ? HttpResponse.json({ ok: false, message: '동시에 수정되었어요.', data: null }, { status: 409 })
        : HttpResponse.json({ ok: true, message: null, data: null }),
    );
    const user = userEvent.setup();
    const { dialog, confirmButton } = await openDialog(user, STATUS_CHANGE_CASE);
    await user.click(confirmButton);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('동시에 수정되었어요.');

    await user.click(within(dialog).getByRole('button', { name: STATUS_CHANGE_CASE.confirmButtonName }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(confirmRequestCount).toBe(2);
  });
});
