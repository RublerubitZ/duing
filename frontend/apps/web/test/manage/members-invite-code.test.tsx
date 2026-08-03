import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { JoinCodeSummary } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { InviteCodeDialog } from '@/app/manage/clubs/[clubId]/members/_components/InviteCodeDialog';

const CLUB_ID = 7;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

// 만료 표시가 "지금" 에 의존하므로 고정 시각 기준으로 미래/과거 코드를 만든다.
const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function joinCode(overrides: Partial<JoinCodeSummary> = {}): JoinCodeSummary {
  return {
    joinCodeId: 3,
    code: 'ABCD1234',
    generation: 12,
    maxUses: 30,
    usedCount: 4,
    expiresAt: FUTURE_ISO,
    recruitmentOpen: true,
    ...overrides,
  };
}

const writeText = vi.fn(() => Promise.resolve());

const server = setupServer();
beforeAll(() => server.listen());
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  server.resetHandlers();
  mockAddToast.mockClear();
  writeText.mockClear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderDialog({ useGeneration = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <InviteCodeDialog clubId={CLUB_ID} useGeneration={useGeneration} onClose={() => {}} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('회원 초대 다이얼로그 — 코드 생성', () => {
  it('활성 코드가 없으면 생성 폼을 보여주고 만료 기본값은 30일이다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(null)));
    renderDialog();

    expect(await screen.findByRole('combobox', { name: '유효 기간' })).toHaveValue('30');
    expect(screen.getByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '기수 (선택)' })).toBeInTheDocument();
  });

  it('기수를 쓰지 않는 동아리에는 기수 입력을 노출하지 않는다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(null)));
    renderDialog({ useGeneration: false });

    expect(await screen.findByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: '기수 (선택)' })).not.toBeInTheDocument();
  });

  it('입력한 인원·기간·기수로 코드를 생성한다', async () => {
    let created: unknown = null;
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(null)),
      http.post(`*/clubs/${CLUB_ID}/join-codes`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ ok: true, message: null, data: joinCode() }, { status: 201 });
      }),
    );
    renderDialog();

    await userEvent.type(
      await screen.findByRole('spinbutton', { name: '최대 사용 인원' }),
      '30',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '유효 기간' }), '7');
    await userEvent.type(screen.getByRole('spinbutton', { name: '기수 (선택)' }), '12');
    await userEvent.click(screen.getByRole('button', { name: '코드 만들기' }));

    await waitFor(() =>
      expect(created).toEqual({ maxUses: 30, expiresInDays: 7, generation: 12 }),
    );
  });

  it('생성에 성공하면 활성 코드가 도착하기 전까지 버튼이 다시 열리지 않는다', async () => {
    let releaseRefetch = () => {};
    let activeCalls = 0;
    let postCalls = 0;
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, async () => {
        activeCalls += 1;
        // 생성 후 재조회를 붙잡아 "코드는 만들어졌는데 화면은 아직 폼" 인 창을 재현한다.
        if (activeCalls > 1) {
          await new Promise<void>((resolve) => {
            releaseRefetch = resolve;
          });
          return json(joinCode());
        }
        return json(null);
      }),
      http.post(`*/clubs/${CLUB_ID}/join-codes`, () => {
        postCalls += 1;
        return HttpResponse.json({ ok: true, message: null, data: joinCode() }, { status: 201 });
      }),
    );
    renderDialog();

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 사용 인원' }), '30');
    const createButton = screen.getByRole('button', { name: '코드 만들기' });
    await userEvent.click(createButton);

    await waitFor(() => expect(createButton).toBeDisabled());
    await userEvent.click(createButton);
    expect(postCalls).toBe(1);

    releaseRefetch();
    expect(await screen.findByText('ABCD1234')).toBeInTheDocument();
  });

  it('인원이 비어 있으면 생성하지 않고 입력을 안내한다', async () => {
    const postCalls: string[] = [];
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(null)),
      http.post(`*/clubs/${CLUB_ID}/join-codes`, () => {
        postCalls.push('called');
        return HttpResponse.json({ ok: true, message: null, data: joinCode() }, { status: 201 });
      }),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: '코드 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '최대 사용 인원은 1~500 사이로 입력해주세요.',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('진행 중인 외부 폼 모집이 없어 409 가 나면 서버 메시지를 그대로 보여준다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(null)),
      http.post(`*/clubs/${CLUB_ID}/join-codes`, () =>
        HttpResponse.json(
          {
            ok: false,
            message: '진행 중인 외부 폼 모집이 있을 때만 가입 코드를 만들 수 있습니다.',
            data: null,
          },
          { status: 409 },
        ),
      ),
    );
    renderDialog();

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 사용 인원' }), '30');
    await userEvent.click(screen.getByRole('button', { name: '코드 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '진행 중인 외부 폼 모집이 있을 때만 가입 코드를 만들 수 있습니다.',
    );
  });
});

describe('회원 초대 다이얼로그 — 활성 코드 카드', () => {
  it('코드·사용 현황·만료일을 보여주고 초대 링크를 복사한다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(joinCode())));
    renderDialog();

    expect(await screen.findByText('ABCD1234')).toBeInTheDocument();
    expect(screen.getByText('4 / 30명')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '초대 링크 복사' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/ABCD1234`);
  });

  it('코드 문자열만 따로 복사할 수 있다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(joinCode())));
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: '코드 복사' }));

    expect(writeText).toHaveBeenCalledWith('ABCD1234');
  });

  it('모집이 마감된 코드에는 사용 불가 배지를 보여준다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () =>
        json(joinCode({ recruitmentOpen: false })),
      ),
    );
    renderDialog();

    expect(await screen.findByText('모집 마감으로 사용 불가')).toBeInTheDocument();
  });

  it('만료 시각이 지난 코드에는 만료 배지를 보여준다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(joinCode({ expiresAt: PAST_ISO }))),
    );
    renderDialog();

    expect(await screen.findByText('만료됨')).toBeInTheDocument();
  });

  it('폐기는 확인 모달을 거치고 성공하면 생성 폼으로 돌아간다', async () => {
    let active: JoinCodeSummary | null = joinCode();
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(active)),
      http.delete(`*/clubs/${CLUB_ID}/join-codes/3`, () => {
        active = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: '코드 폐기' }));

    const confirm = await screen.findByRole('dialog', { name: '가입 코드를 폐기할까요?' });
    await userEvent.click(within(confirm).getByRole('button', { name: '폐기' }));

    expect(await screen.findByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
  });

  it('폐기가 실패하면 확인 모달을 닫지 않고 모달 안에서 안내한다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(joinCode())),
      http.delete(`*/clubs/${CLUB_ID}/join-codes/3`, () =>
        HttpResponse.json({ ok: false, message: '폐기할 수 없습니다.', data: null }, { status: 409 }),
      ),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: '코드 폐기' }));
    const confirm = await screen.findByRole('dialog', { name: '가입 코드를 폐기할까요?' });
    await userEvent.click(within(confirm).getByRole('button', { name: '폐기' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('폐기할 수 없습니다.');
    expect(screen.getByRole('dialog', { name: '가입 코드를 폐기할까요?' })).toBeInTheDocument();
  });

  it('재생성은 기존 코드가 무효해진다는 확인을 거친다', async () => {
    server.use(http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(joinCode())));
    renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: '코드 재생성' }));

    const confirm = await screen.findByRole('dialog', { name: '코드를 새로 만들까요?' });
    expect(within(confirm).getByText(/기존 코드는 즉시 사용할 수 없게 됩니다/)).toBeInTheDocument();
  });
});
