import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, formatDateTimeKst } from '@duing/hooks';
import type { JoinCodeSummary } from '@duing/types';
import { ClubInviteDialog } from '@/app/manage/clubs/[clubId]/members/_components/ClubInviteDialog';

// 회원 관리 헤더의 [부원 초대] 다이얼로그 (스펙 2026-08-08 §7) — 모집과 무관한 동아리 단위 초대 링크다.
// 유효기간은 발급 시각 기준 절대 만료(24/72시간)이고, 자동 승인 옵션이 있으며 폐기는 단일 확인이다.

const CLUB_ID = 7;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const JOIN_LINK = `${window.location.origin}/join/ABCD1234`;

const AUTO_APPROVE_WARNING = '승인 없이 바로 가입됩니다. 링크 유출에 주의하세요.';

/** 초대 링크는 만료가 joinExpiresAt·inviteExpiresAt 양쪽에 같은 값으로 실린다(BE 계약). */
function inviteCode(overrides: Partial<JoinCodeSummary> = {}): JoinCodeSummary {
  const expiresAt = overrides.inviteExpiresAt ?? FUTURE_ISO;
  return {
    joinCodeId: 3,
    code: 'ABCD1234',
    generation: 12,
    maxUses: 30,
    usedCount: 4,
    joinWindowDays: 0,
    joinExpiresAt: expiresAt,
    totalRequestCount: 6,
    pendingCount: 2,
    linkType: 'CLUB_INVITE',
    inviteExpiresAt: expiresAt,
    autoApprove: false,
    ...overrides,
  };
}

const writeText = vi.fn(() => Promise.resolve());

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  server.resetHandlers();
  writeText.mockClear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

/** 활성 초대 링크 응답을 지정하고 다이얼로그를 연다. 기본은 "활성 링크 없음"(200 + null). */
async function openDialog({
  activeCode = null,
  useGeneration = true,
}: { activeCode?: JoinCodeSummary | null; useGeneration?: boolean } = {}) {
  server.use(
    http.get(`*/clubs/${CLUB_ID}/join-codes/active`, () => json(activeCode)),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  render(
    <Wrapper>
      <ClubInviteDialog clubId={CLUB_ID} useGeneration={useGeneration} />
    </Wrapper>,
  );

  await userEvent.click(screen.getByRole('button', { name: '부원 초대' }));
}

describe('부원 초대 다이얼로그 — 발급 폼', () => {
  it('활성 링크가 없으면 유효기간 24시간 기본·인원·기수·자동 승인 꺼짐 상태의 폼을 보여준다', async () => {
    await openDialog();

    expect(await screen.findByRole('radio', { name: '24시간' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '72시간' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: '최대 인원' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '기수 (선택)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '자동 승인' })).not.toBeChecked();
    expect(screen.queryByText(AUTO_APPROVE_WARNING)).not.toBeInTheDocument();
  });

  it('기수를 쓰지 않는 동아리에는 기수 입력을 노출하지 않는다', async () => {
    await openDialog({ useGeneration: false });

    expect(await screen.findByRole('spinbutton', { name: '최대 인원' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: '기수 (선택)' })).not.toBeInTheDocument();
  });

  it('자동 승인을 켜면 승인 없이 가입된다는 경고문을 보여준다', async () => {
    await openDialog();

    await userEvent.click(await screen.findByRole('checkbox', { name: '자동 승인' }));

    expect(screen.getByText(AUTO_APPROVE_WARNING)).toBeInTheDocument();
  });

  it('최대 인원이 150 을 넘으면 요청하지 않고 인라인 에러를 보여준다', async () => {
    await openDialog();

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 인원' }), '151');
    await userEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '최대 인원은 1~150 사이로 입력해주세요.',
    );
  });

  it('입력한 인원·유효기간·기수·자동 승인을 클럽 스코프 경로로 보낸다', async () => {
    let created: unknown = null;
    await openDialog();
    server.use(
      http.post(`*/clubs/${CLUB_ID}/join-codes`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ ok: true, message: null, data: inviteCode() }, { status: 201 });
      }),
    );

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 인원' }), '40');
    await userEvent.click(screen.getByRole('radio', { name: '72시간' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: '기수 (선택)' }), '12');
    await userEvent.click(screen.getByRole('checkbox', { name: '자동 승인' }));
    await userEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }));

    await waitFor(() =>
      expect(created).toEqual({
        maxUses: 40,
        expiresInHours: 72,
        autoApprove: true,
        generation: 12,
      }),
    );
  });

  it('기수를 비우면 기수 필드를 보내지 않고 기본값(24시간·자동 승인 꺼짐)으로 만든다', async () => {
    let created: unknown = null;
    await openDialog();
    server.use(
      http.post(`*/clubs/${CLUB_ID}/join-codes`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ ok: true, message: null, data: inviteCode() }, { status: 201 });
      }),
    );

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 인원' }), '40');
    await userEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }));

    await waitFor(() =>
      expect(created).toEqual({ maxUses: 40, expiresInHours: 24, autoApprove: false }),
    );
  });
});

describe('부원 초대 다이얼로그 — 활성 링크 카드', () => {
  it('상태·만료 일시·가입 현황을 서버 수치 그대로 보여주고 액션 4종을 노출한다', async () => {
    await openDialog({ activeCode: inviteCode() });

    expect(await screen.findByText('🟢 활성')).toBeInTheDocument();
    expect(screen.getByText(`${formatDateTimeKst(FUTURE_ISO)}까지`)).toBeInTheDocument();
    // 누적 신청 6 / 최대 30 · 승인 대기 2 — 서버 카운트를 합산하거나 파생하지 않는다.
    expect(screen.getByText('누적 신청')).toBeInTheDocument();
    expect(screen.getByText('6 / 30명')).toBeInTheDocument();
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('2명')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '링크 재생성' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '링크 폐기' })).toBeInTheDocument();
  });

  it('링크 복사는 가입 링크 전체를 클립보드에 넣는다', async () => {
    await openDialog({ activeCode: inviteCode() });

    await userEvent.click(await screen.findByRole('button', { name: '링크 복사' }));

    expect(writeText).toHaveBeenCalledWith(JOIN_LINK);
  });

  it('QR 보기를 누르면 가입 링크를 담은 QR 코드를 렌더한다', async () => {
    await openDialog({ activeCode: inviteCode() });

    await screen.findByRole('button', { name: 'QR 보기' });
    expect(document.body.querySelector('svg')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'QR 보기' }));

    expect(screen.getByTitle(JOIN_LINK).closest('svg')).toBeInTheDocument();
  });

  it('폐기는 타이핑 없이 단일 확인 모달만 거쳐 폐기 요청을 보낸다', async () => {
    let revokedId: string | null = null;
    await openDialog({ activeCode: inviteCode() });
    server.use(
      http.delete(`*/clubs/${CLUB_ID}/join-codes/:joinCodeId`, ({ params }) => {
        revokedId = String(params.joinCodeId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: '링크 폐기' }));

    expect(await screen.findByText('초대 링크를 폐기할까요?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '폐기' }));

    await waitFor(() => expect(revokedId).toBe('3'));
  });

  it('만료된 링크는 만료됨 상태와 재생성 안내를 보여준다', async () => {
    await openDialog({ activeCode: inviteCode({ inviteExpiresAt: PAST_ISO, joinExpiresAt: PAST_ISO }) });

    expect(await screen.findByText('만료됨')).toBeInTheDocument();
    expect(
      screen.getByText('만료된 초대 링크예요. 새로 만들어 다시 공유해주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '링크 재생성' })).toBeInTheDocument();
  });

  it('인원이 모두 찬 링크는 인원 마감 상태와 재생성 안내를 보여준다', async () => {
    await openDialog({ activeCode: inviteCode({ usedCount: 30, maxUses: 30 }) });

    expect(await screen.findByText('인원 마감')).toBeInTheDocument();
    expect(
      screen.getByText('초대 인원이 모두 찼어요. 새로 만들어 다시 공유해주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '링크 재생성' })).toBeInTheDocument();
  });

  it('재생성을 확인하면 같은 자리에서 발급 폼으로 바뀐다', async () => {
    await openDialog({ activeCode: inviteCode() });

    await userEvent.click(await screen.findByRole('button', { name: '링크 재생성' }));
    await userEvent.click(await screen.findByRole('button', { name: '새로 만들기' }));

    expect(await screen.findByRole('spinbutton', { name: '최대 인원' })).toBeInTheDocument();
  });
});
