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
  useSearchParams: () => new URLSearchParams('status=INACTIVE_PENDING'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/clubs',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const INACTIVE_CLUB: AdminClubSummary = {
  id: 9, name: '쉬는 동아리', category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'INACTIVE', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null,
  statusChangedAt: '2026-10-27T03:00:00Z', statusChangedByName: '총동연관리자',
  undecidedApplicationCount: 3, pendingJoinRequestCount: 1,
};
const CLUBS_PAGE: PageResponse<AdminClubSummary> = {
  content: [INACTIVE_CLUB], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false,
};

let listRequestCount = 0;
let cleanupRequestCount = 0;
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
  cleanupRequestCount = 0;
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

const respondCleanup = (respond: () => Response) =>
  server.use(
    http.post(`*/admin/clubs/${INACTIVE_CLUB.id}/pending-cleanup`, () => {
      cleanupRequestCount += 1;
      return respond();
    }),
  );

async function openDialogAndConfirm() {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: '남은 미결 정리' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: '정리하기' }));
  return dialog;
}

describe('AdminClubsListPage — 남은 미결 정리 흐름', () => {
  it('행에 남은 건수를 보이고, 정리하면 창이 닫히며 응답 건수로 토스트를 띄우고 목록을 다시 받는다', async () => {
    respondCleanup(() =>
      HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 2, rejectedJoinRequestCount: 1 } }),
    );
    renderPage();
    expect(await screen.findByText('남은 지원서 3 · 가입 신청 1')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '남은 미결 정리' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('쉬는 동아리의 남은 미결을 정리할까요?');
    await user.click(within(dialog).getByRole('button', { name: '정리하기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // 창의 건수(목록 시점 3건)가 아니라 실제 처리 건수로 알린다
    expect(await screen.findByText('지원서 2건·가입 신청 1건을 정리했어요')).toBeInTheDocument();
    expect(cleanupRequestCount).toBe(1);
    await waitFor(() => expect(listRequestCount).toBeGreaterThanOrEqual(2));
  });

  it('둘 다 0건이면(그사이 다른 담당자가 정리) 정리할 미결이 없었다고 알린다', async () => {
    respondCleanup(() =>
      HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 0, rejectedJoinRequestCount: 0 } }),
    );
    await openDialogAndConfirm();
    expect(await screen.findByText('정리할 미결이 없었어요')).toBeInTheDocument();
  });

  it('정리하기를 연달아 눌러도 정리 요청은 한 번만 간다(Review Focus 3)', async () => {
    let releaseCleanup: () => void = () => {};
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    server.use(
      http.post(`*/admin/clubs/${INACTIVE_CLUB.id}/pending-cleanup`, async () => {
        cleanupRequestCount += 1;
        await cleanupGate;
        return HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '남은 미결 정리' }));
    const dialog = await screen.findByRole('dialog');
    await user.dblClick(within(dialog).getByRole('button', { name: '정리하기' }));
    await user.click(within(dialog).getByRole('button', { name: '정리하는 중…' }));

    releaseCleanup();
    expect(await screen.findByText('지원서 3건·가입 신청 1건을 정리했어요')).toBeInTheDocument();
    expect(cleanupRequestCount).toBe(1);
  });

  it('같은 틱에 정리하기를 두 번 눌러도(버튼이 막히기 전) 정리 요청은 한 번이고 토스트도 응답 건수 하나뿐이다', async () => {
    // 실백엔드처럼 두 번째 요청은 잠금 뒤 0·0 을 돌려준다 — 가드가 없으면 모순된 토스트가 함께 뜬다.
    respondCleanup(() =>
      HttpResponse.json({
        ok: true,
        message: null,
        data: cleanupRequestCount === 1
          ? { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 }
          : { rejectedApplicationCount: 0, rejectedJoinRequestCount: 0 },
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '남은 미결 정리' }));
    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: '정리하기' });
    // 사이에 await 이 없어 두 번째 클릭은 React 가 disabled 를 다시 그리기 전에 들어온다(실브라우저 dblclick 과 같다).
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(await screen.findByText('지원서 3건·가입 신청 1건을 정리했어요')).toBeInTheDocument();
    await waitFor(() => expect(listRequestCount).toBeGreaterThanOrEqual(2));
    expect(cleanupRequestCount).toBe(1);
    expect(screen.queryByText('정리할 미결이 없었어요')).not.toBeInTheDocument();
  });

  it('실패 뒤 창에서 다시 정리하기를 누르면 정리 요청이 다시 간다', async () => {
    respondCleanup(() =>
      cleanupRequestCount === 1
        ? HttpResponse.json({ ok: false, message: '일시적인 오류예요.', data: null }, { status: 500 })
        : HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 } }),
    );
    const dialog = await openDialogAndConfirm();
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '정리하기' }));
    expect(await screen.findByText('지원서 3건·가입 신청 1건을 정리했어요')).toBeInTheDocument();
    expect(cleanupRequestCount).toBe(2);
  });

  it('정리 뒤 다시 받은 목록에서 그 동아리가 빠지면 행의 건수와 정리 버튼이 사라진다(Review Focus 2)', async () => {
    respondCleanup(() =>
      HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 } }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '남은 미결 정리' }));
    const dialog = await screen.findByRole('dialog');
    // 정리 응답 직후 무효화가 다시 받는 목록 — 남은 미결이 없어 필터에서 빠진다(확인 버튼을 누르기 전에 바꿔 둔다).
    server.use(
      http.get('*/admin/clubs', () => {
        listRequestCount += 1;
        return HttpResponse.json({ ok: true, message: null, data: { ...CLUBS_PAGE, content: [], totalElements: 0, totalPages: 0 } });
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: '정리하기' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '남은 미결 정리' })).not.toBeInTheDocument());
    expect(screen.queryByText('남은 지원서 3 · 가입 신청 1')).not.toBeInTheDocument();
  });

  it('409(그사이 재활성)면 창 안에 서버 문구를 보이고 창을 닫지 않으며, 목록은 다시 받는다', async () => {
    respondCleanup(() =>
      HttpResponse.json(
        { ok: false, message: '운영 중단 동아리만 남은 미결을 정리할 수 있어요.', data: null },
        { status: 409 },
      ),
    );
    const dialog = await openDialogAndConfirm();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('운영 중단 동아리만 남은 미결을 정리할 수 있어요.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(listRequestCount).toBeGreaterThanOrEqual(2));
  });
});
