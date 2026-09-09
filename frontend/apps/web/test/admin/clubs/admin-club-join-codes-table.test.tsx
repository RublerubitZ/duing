import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubJoinCode } from '@duing/types';

import { AdminClubJoinCodesTable } from '@/app/admin/clubs/[clubId]/join-codes/_components/AdminClubJoinCodesTable';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

function joinCodeOf(overrides: Partial<AdminClubJoinCode> = {}): AdminClubJoinCode {
  return {
    joinCodeId: 1,
    linkType: 'CLUB_INVITE',
    code: 'ABC123',
    recruitmentId: null,
    recruitmentTitle: null,
    generation: null,
    maxUses: 30,
    usedCount: 4,
    totalRequestCount: 5,
    pendingCount: 1,
    autoApprove: true,
    joinWindowDays: 0,
    joinExpiresAt: '2026-09-10T03:00:00Z',
    inviteExpiresAt: '2026-09-10T03:00:00Z',
    status: 'ACTIVE',
    createdAt: '2026-09-08T03:00:00Z',
    createdById: 7,
    createdByName: '운영진',
    revokedAt: null,
    revokedById: null,
    revokedByName: null,
    ...overrides,
  };
}

const ALL_STATUS_CODES: AdminClubJoinCode[] = [
  joinCodeOf({ joinCodeId: 1, code: 'ACTIVE1', status: 'ACTIVE' }),
  joinCodeOf({ joinCodeId: 2, code: 'EXPIRE1', status: 'EXPIRED' }),
  joinCodeOf({
    joinCodeId: 3,
    code: 'EXHAUS1',
    status: 'EXHAUSTED',
    linkType: 'RECRUITMENT',
    recruitmentId: 9,
    recruitmentTitle: '2026 신입 모집',
    autoApprove: false,
  }),
  joinCodeOf({
    joinCodeId: 4,
    code: 'REVOKE1',
    status: 'REVOKED',
    revokedAt: '2026-09-09T03:00:00Z',
    revokedById: 3,
    revokedByName: '총동연',
  }),
];

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTable(highlightJoinCodeId: number | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
      <AdminClubJoinCodesTable clubId={1} highlightJoinCodeId={highlightJoinCodeId} />
    </Wrapper>,
  );
}

/** 상태 라벨은 열 머리글("만료"·"폐기")과 글자가 겹치므로 코드로 찾은 본문 행 안에서만 확인한다. */
function bodyRowOf(code: string): HTMLElement {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(code) !== null);
  if (row === undefined) throw new Error(`코드 ${code} 행을 찾지 못했습니다.`);
  return row;
}

function listReturns(joinCodes: AdminClubJoinCode[]) {
  server.use(
    http.get('*/admin/clubs/1/join-codes', () =>
      HttpResponse.json({ ok: true, message: null, data: joinCodes }),
    ),
  );
}

describe('총동연 가입 링크 목록', () => {
  it('폐기·만료·소진된 링크까지 상태 라벨과 함께 모두 보여준다', async () => {
    listReturns(ALL_STATUS_CODES);
    renderTable();

    await screen.findByText('ACTIVE1');
    expect(within(bodyRowOf('ACTIVE1')).getByText('활성')).toBeInTheDocument();
    expect(within(bodyRowOf('EXPIRE1')).getByText('만료')).toBeInTheDocument();
    expect(within(bodyRowOf('EXHAUS1')).getByText('소진')).toBeInTheDocument();
    expect(within(bodyRowOf('REVOKE1')).getByText('폐기')).toBeInTheDocument();
    expect(within(bodyRowOf('EXHAUS1')).getByText('모집 가입 · 2026 신입 모집')).toBeInTheDocument();
    // 폐기 행에는 누가 언제 끊었는지가 남는다.
    expect(within(bodyRowOf('REVOKE1')).getByText('총동연')).toBeInTheDocument();
  });

  it('강제 폐기 버튼은 활성 링크에만 보인다', async () => {
    listReturns(ALL_STATUS_CODES);
    renderTable();

    await screen.findByText('활성');
    expect(screen.getAllByRole('button', { name: /강제 폐기/ })).toHaveLength(1);
  });

  it('사유가 비면 폐기할 수 없고, 사유를 채우면 그 링크로 폐기 요청이 나간다', async () => {
    listReturns([joinCodeOf({ joinCodeId: 42, code: 'ACTIVE1' })]);
    let revokeUrl = '';
    let revokeBody: unknown = null;
    server.use(
      http.patch('*/admin/clubs/1/join-codes/42/revoke', async ({ request }) => {
        revokeUrl = request.url;
        revokeBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTable();

    await userEvent.click(await screen.findByRole('button', { name: /강제 폐기/ }));

    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: '강제 폐기' });
    expect(confirmButton).toBeDisabled();

    // 공백만 넣은 사유도 제출을 열어주지 않는다.
    await userEvent.type(within(dialog).getByLabelText(/폐기 사유/), '   ');
    expect(confirmButton).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/폐기 사유/), '유출 신고 접수');
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(revokeBody).not.toBeNull());
    expect(new URL(revokeUrl).pathname).toBe('/api/v1/admin/clubs/1/join-codes/42/revoke');
    expect(revokeBody).toEqual({ reason: '유출 신고 접수' });
    expect(await screen.findByText('가입 링크를 폐기했어요')).toBeInTheDocument();
  });

  it('전송 중에는 확인 버튼을 잠가 중복 폐기를 막는다', async () => {
    listReturns([joinCodeOf({ joinCodeId: 42 })]);
    server.use(
      http.patch('*/admin/clubs/1/join-codes/42/revoke', async () => {
        await delay(200);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTable();

    await userEvent.click(await screen.findByRole('button', { name: /강제 폐기/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/폐기 사유/), '유출 신고 접수');
    await userEvent.click(within(dialog).getByRole('button', { name: '강제 폐기' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: '강제 폐기' })).toBeDisabled(),
    );
  });

  it('실패하면 서버 문구를 토스트로 알리고 다이얼로그를 닫지 않는다', async () => {
    listReturns([joinCodeOf({ joinCodeId: 42 })]);
    server.use(
      http.patch('*/admin/clubs/1/join-codes/42/revoke', () =>
        HttpResponse.json(
          { ok: false, message: '이미 폐기된 링크입니다.', data: null },
          { status: 409 },
        ),
      ),
    );
    renderTable();

    await userEvent.click(await screen.findByRole('button', { name: /강제 폐기/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/폐기 사유/), '유출 신고 접수');
    await userEvent.click(within(dialog).getByRole('button', { name: '강제 폐기' }));

    expect(await screen.findByText('이미 폐기된 링크입니다.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('활동 이력에서 넘어온 링크 행만 강조한다', async () => {
    listReturns(ALL_STATUS_CODES);
    renderTable(3);

    await screen.findByText('EXHAUS1');
    expect(bodyRowOf('EXHAUS1')).toHaveAttribute('data-highlighted', 'true');
    expect(bodyRowOf('ACTIVE1')).not.toHaveAttribute('data-highlighted');
  });

  it('목록에 없는 joinCodeId 는 조용히 무시한다', async () => {
    listReturns(ALL_STATUS_CODES);
    const { container } = renderTable(9999);

    await screen.findByText('활성');
    expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
  });

  it('링크가 하나도 없으면 빈 상태를 안내한다', async () => {
    listReturns([]);
    renderTable();

    expect(await screen.findByText('발급된 가입 링크가 없어요')).toBeInTheDocument();
  });

  it('조회에 실패하면 다시 시도할 수 있게 안내한다', async () => {
    server.use(
      http.get('*/admin/clubs/1/join-codes', () =>
        HttpResponse.json({ ok: false, message: '실패', data: null }, { status: 500 }),
      ),
    );
    renderTable();

    expect(await screen.findByText('가입 링크를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
