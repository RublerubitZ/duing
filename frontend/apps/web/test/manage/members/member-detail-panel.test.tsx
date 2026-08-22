import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubMember } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { MemberDetailPanel } from '@/app/manage/clubs/[clubId]/members/_components/MemberDetailPanel';

const CLUB_ID = 7;
const MEMBER_ID = 42;

let capturedRoleBody: Record<string, unknown> | null = null;
let capturedGenerationBody: Record<string, unknown> | null = null;
let removeCalled = false;
let leaveCalled = false;

const server = setupServer(
  http.patch(
    `http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}/role`,
    async ({ request }) => {
      capturedRoleBody = (await request.json()) as Record<string, unknown>;
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.patch(
    `http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}/generation`,
    async ({ request }) => {
      capturedGenerationBody = (await request.json()) as Record<string, unknown>;
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.delete(`http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}`, () => {
    removeCalled = true;
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete(`http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/me`, () => {
    leaveCalled = true;
    return new HttpResponse(null, { status: 204 });
  }),
);

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  capturedRoleBody = null;
  capturedGenerationBody = null;
  removeCalled = false;
  leaveCalled = false;
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// jsdom 은 matchMedia 가 없다 — 항상 매치(=데스크탑 min-width:1024)로 스텁해 패널을 인라인 모드로 렌더한다.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

function member(overrides: Partial<ClubMember> = {}): ClubMember {
  return {
    memberId: MEMBER_ID,
    userId: 100,
    name: '홍길동',
    studentId: '20200001',
    role: 'MEMBER',
    joinedAt: '2024-01-10',
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    phoneMasked: '010-****-5678',
    generation: 3,
    feeStatus: 'PAID',
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof MemberDetailPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onTransferLeader = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = (node: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>{node}</ApiClientProvider>
    </QueryClientProvider>
  );
  const utils = render(
    wrapper(
      <MemberDetailPanel
        member={member()}
        clubId={CLUB_ID}
        useGeneration
        viewerRole="LEADER"
        viewerUserId={999}
        open
        onClose={onClose}
        onTransferLeader={onTransferLeader}
        {...props}
      />,
    ),
  );
  return { ...utils, onClose, onTransferLeader };
}

describe('MemberDetailPanel — 렌더 게이트', () => {
  it('open=false 면 아무것도 렌더하지 않는다', () => {
    const { container } = renderPanel({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('member=null 이면 아무것도 렌더하지 않는다', () => {
    const { container } = renderPanel({ member: null });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MemberDetailPanel — 기수 조건부', () => {
  it('useGeneration=true 면 기수 값을 표시한다', () => {
    renderPanel({ member: member({ generation: 3 }) });
    expect(screen.getByText('기수')).toBeInTheDocument();
    expect(screen.getByText('3기')).toBeInTheDocument();
  });

  it('generation=null 이면 기수 값은 "—"', () => {
    renderPanel({ member: member({ generation: null }) });
    expect(screen.getByText('기수')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('useGeneration=false 면 기수 필드도 수정기도 없다', () => {
    renderPanel({ member: member({ generation: 3 }), useGeneration: false });
    expect(screen.queryByText('기수')).not.toBeInTheDocument();
    expect(screen.queryByText('기수 수정')).not.toBeInTheDocument();
  });
});

describe('MemberDetailPanel — 회비 3상태', () => {
  it('PAID 는 "납부"', () => {
    renderPanel({ member: member({ feeStatus: 'PAID' }) });
    expect(screen.getByText('납부')).toBeInTheDocument();
  });
  it('UNPAID 는 "미납"', () => {
    renderPanel({ member: member({ feeStatus: 'UNPAID' }) });
    expect(screen.getByText('미납')).toBeInTheDocument();
  });
  it('NONE 은 "관리 대상 아님"', () => {
    renderPanel({ member: member({ feeStatus: 'NONE' }) });
    expect(screen.getByText('관리 대상 아님')).toBeInTheDocument();
  });
  it('회비 관리 링크는 fees 경로를 가리킨다', () => {
    renderPanel();
    expect(screen.getByRole('link', { name: '회비 관리에서 보기' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/fees`,
    );
  });
});

describe('MemberDetailPanel — 연락처 표시', () => {
  it('마스킹된 번호를 그대로 보여준다', () => {
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
  });

  it('연락처가 없으면 "—" 이고 번호 보기 버튼도 없다', () => {
    renderPanel({ member: member({ phoneMasked: null }) });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '번호 보기' })).not.toBeInTheDocument();
  });

  it('OFFICER 뷰어에게도 번호 보기 버튼이 노출된다 — 연락처 원본은 운영진 공통 권한', () => {
    renderPanel({ viewerRole: 'OFFICER', member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
  });

  it('조회 전에는 복사 버튼이 없다 — 마스킹 값이 복사되는 경로를 만들지 않는다', () => {
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연락처 복사' })).not.toBeInTheDocument();
  });

  it('번호 보기 성공 시 원본을 표시하고 번호 보기 버튼은 사라진다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));

    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.queryByText('010-****-5678')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '번호 보기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연락처 복사' })).toBeInTheDocument();
  });

  it('복사는 마스킹이 아니라 조회한 원본을 클립보드에 넣는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    await userEvent.click(await screen.findByRole('button', { name: '연락처 복사' }));

    expect(writeText).toHaveBeenCalledWith('010-1234-5678');
    expect(writeText).not.toHaveBeenCalledWith('010-****-5678');
  });

  it('복사 성공 후에는 버튼의 접근가능 이름이 복사됨을 알린다 — 스크린리더가 결과를 놓치지 않는다', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    await userEvent.click(await screen.findByRole('button', { name: '연락처 복사' }));

    expect(await screen.findByRole('button', { name: '연락처 복사됨' })).toBeInTheDocument();
  });

  it('조회에 실패하면 마스킹을 유지하고 복사 버튼도 내주지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json(
          { ok: false, message: '해당 동아리의 회장만 가능한 작업입니다.', data: null },
          { status: 403 },
        ),
      ),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));

    expect(await screen.findByText('해당 동아리의 회장만 가능한 작업입니다.')).toBeInTheDocument();
    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연락처 복사' })).not.toBeInTheDocument();
  });

  it('다른 회원으로 전환하면 노출이 초기화된다 — 앞 사람 번호가 남지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    const { rerender } = renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ApiClientProvider client={apiClient}>
          <MemberDetailPanel
            member={member({ memberId: MEMBER_ID + 1, name: '김철수', phoneMasked: '010-****-9999' })}
            clubId={CLUB_ID}
            useGeneration
            viewerRole="LEADER"
            viewerUserId={999}
            open
            onClose={() => {}}
            onTransferLeader={() => {}}
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('010-****-9999')).toBeInTheDocument();
    expect(screen.queryByText('010-1234-5678')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
  });

  // 노출 상태를 88행 `if (!open || !member) return null` 가드 위(MemberDetailPanel 본체)에 두면
  // 닫아도 컴포넌트 인스턴스가 살아 남아 A 의 번호가 B 화면에 뜬다 — 타 회원 개인정보 오표시.
  it('닫았다가 다른 회원으로 다시 열어도 앞 사람 번호가 남지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const panel = (props: Partial<Parameters<typeof MemberDetailPanel>[0]>) => (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <MemberDetailPanel
            member={member({ phoneMasked: '010-****-5678' })}
            clubId={CLUB_ID}
            useGeneration
            viewerRole="LEADER"
            viewerUserId={999}
            open
            onClose={() => {}}
            onTransferLeader={() => {}}
            {...props}
          />
        </ApiClientProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(panel({}));

    await userEvent.click(screen.getByRole('button', { name: '번호 보기' }));
    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();

    rerender(panel({ open: false }));
    rerender(
      panel({
        member: member({ memberId: MEMBER_ID + 1, name: '김철수', phoneMasked: '010-****-9999' }),
      }),
    );

    expect(screen.getByText('010-****-9999')).toBeInTheDocument();
    expect(screen.queryByText('010-1234-5678')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 보기' })).toBeInTheDocument();
  });

  it('조회 중에는 번호 보기 버튼이 비활성이다 — 연타로 중복 조회·감사 로그가 생기지 않는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/members/${MEMBER_ID}/phone`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } });
      }),
    );
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    const revealButton = screen.getByRole('button', { name: '번호 보기' });
    await userEvent.click(revealButton);

    expect(revealButton).toBeDisabled();
    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();
  });
});

describe('MemberDetailPanel — 권한 게이트', () => {
  it('LEADER 뷰어는 타인 MEMBER 행에서 관리 액션을 본다', () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });
    expect(screen.getByRole('button', { name: '임원으로 승급' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회장 인계' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '탈퇴' })).toBeInTheDocument();
    expect(screen.getByText('관리')).toBeInTheDocument();
  });

  it('OFFICER 뷰어는 타인 행에서 기수 수정만 보이고 회장 전용 액션은 없다', () => {
    renderPanel({ viewerRole: 'OFFICER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });
    expect(screen.getByText('기수 수정')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '임원으로 승급' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '회장 인계' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '탈퇴' })).not.toBeInTheDocument();
  });

  it('OFFICER 뷰어 + useGeneration=false 면 타인 행에서 관리 섹션 자체가 없다', () => {
    renderPanel({
      viewerRole: 'OFFICER',
      viewerUserId: 999,
      useGeneration: false,
      member: member({ role: 'MEMBER' }),
    });
    expect(screen.queryByText('관리')).not.toBeInTheDocument();
  });

  it('OFFICER 뷰어는 본인 행에서 기수 수정과 탈퇴를 본다', () => {
    renderPanel({
      viewerRole: 'OFFICER',
      viewerUserId: 100,
      member: member({ userId: 100, role: 'OFFICER' }),
    });
    expect(screen.getByText('기수 수정')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '탈퇴' })).toBeInTheDocument();
    // 회장 전용 관리 액션은 노출되지 않는다.
    expect(screen.queryByRole('button', { name: '회장 인계' })).not.toBeInTheDocument();
  });

  it('LEADER 뷰어 본인(회장) 행은 탈퇴가 비활성', () => {
    renderPanel({
      viewerRole: 'LEADER',
      viewerUserId: 100,
      member: member({ userId: 100, role: 'LEADER' }),
    });
    expect(screen.getByRole('button', { name: '탈퇴' })).toBeDisabled();
  });
});

describe('MemberDetailPanel — 관리 액션 배선', () => {
  it('역할 승급은 role PATCH 를 보낸다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));
    // 네이티브 confirm 대신 확인 모달 — 확인 버튼을 눌러야 실제 요청이 나간다.
    await userEvent.click(await screen.findByRole('button', { name: '승급' }));

    await waitFor(() => expect(capturedRoleBody).toEqual({ role: 'OFFICER' }));
  });

  it('역할 변경이 실패하면 모달이 열린 채로 오류를 모달 안에 보여주고 재시도할 수 있다', async () => {
    let attempts = 0;
    server.use(
      http.patch(
        `http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}/role`,
        async ({ request }) => {
          attempts += 1;
          if (attempts === 1) {
            return HttpResponse.json(
              { ok: false, message: '권한이 없습니다.', data: null },
              { status: 403 },
            );
          }
          capturedRoleBody = (await request.json()) as { role: string };
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));
    await userEvent.click(await screen.findByRole('button', { name: '승급' }));

    // 모달이 유지되고, 오류가 모달 서브트리 안에 있다.
    const dialog = await screen.findByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('권한이 없습니다.');
    // 접근성 트리에서 실제로 도달 가능한지 — 조상에 aria-hidden 이 걸려 있으면 스크린리더가 못 읽는다.
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    // 대비 증거 — 모달이 열려 있는 동안 바깥 본문은 접근성 트리에서 숨겨진다.
    // 오류를 모달 밖에 그리면 정확히 이 안에 갇힌다(이 규칙이 존재하는 이유).
    expect(
      screen.getByRole('heading', { name: '관리', hidden: true }).closest('[aria-hidden="true"]'),
    ).not.toBeNull();

    // 같은 자리에서 재시도 — 버튼이 다시 눌리고 이번엔 성공한다.
    await userEvent.click(within(dialog).getByRole('button', { name: '승급' }));
    await waitFor(() => expect(capturedRoleBody).toEqual({ role: 'OFFICER' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('실패 후 취소하면 오류가 초기화되어 다시 열어도 남지 않는다', async () => {
    server.use(
      http.patch(
        `http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}/role`,
        () => HttpResponse.json({ ok: false, message: '권한이 없습니다.', data: null }, { status: 403 }),
      ),
    );
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));
    await userEvent.click(await screen.findByRole('button', { name: '승급' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.');

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));

    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('역할 변경 확인을 취소하면 role PATCH 가 나가지 않는다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));
    await userEvent.click(await screen.findByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(capturedRoleBody).toBeNull();
  });

  it('기수 저장은 generation PATCH 를 정수로 보낸다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ generation: 3 }) });

    const input = screen.getByLabelText('기수 수정');
    fireEvent.change(input, { target: { value: '12' } });
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(capturedGenerationBody).toEqual({ generation: 12 }));
  });

  it('OFFICER 뷰어의 기수 저장도 generation PATCH 를 보낸다 — 기수 수정은 운영진 공통', async () => {
    renderPanel({ viewerRole: 'OFFICER', viewerUserId: 999, member: member({ generation: 3 }) });

    fireEvent.change(screen.getByLabelText('기수 수정'), { target: { value: '12' } });
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(capturedGenerationBody).toEqual({ generation: 12 }));
  });

  it('기수 비우기는 generation=null 을 보낸다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ generation: 3 }) });

    await userEvent.click(screen.getByRole('button', { name: '비우기' }));

    await waitFor(() => expect(capturedGenerationBody).toEqual({ generation: null }));
  });

  it('기수가 양의 정수가 아니면 저장하지 않고 검증 메시지를 보인다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ generation: null }) });

    fireEvent.change(screen.getByLabelText('기수 수정'), { target: { value: '0' } });
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('기수는 1 이상의 정수여야 해요')).toBeInTheDocument();
    expect(capturedGenerationBody).toBeNull();
  });

  it('탈퇴는 확인 다이얼로그를 거쳐 DELETE 를 보낸다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('회장 인계는 onTransferLeader 콜백을 해당 회원으로 부른다', async () => {
    const target = member({ role: 'MEMBER' });
    const { onTransferLeader } = renderPanel({
      viewerRole: 'LEADER',
      viewerUserId: 999,
      member: target,
    });

    await userEvent.click(screen.getByRole('button', { name: '회장 인계' }));

    expect(onTransferLeader).toHaveBeenCalledWith(target);
  });

  it('OFFICER 본인 탈퇴는 확인 후 leave DELETE 를 보낸다', async () => {
    renderPanel({
      viewerRole: 'OFFICER',
      viewerUserId: 100,
      member: member({ userId: 100, role: 'OFFICER' }),
    });

    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    await waitFor(() => expect(leaveCalled).toBe(true));
  });
});

describe('MemberDetailPanel — 회원 전환 시 상태 격리', () => {
  it('앞 회원의 실패 메시지가 다음 회원 화면에 남지 않는다', async () => {
    server.use(
      http.patch(
        `http://localhost:8080/api/v1/clubs/${CLUB_ID}/members/${MEMBER_ID}/role`,
        () => HttpResponse.json({ ok: false, message: '권한이 없습니다.', data: null }, { status: 403 }),
      ),
    );
    const first = member({ memberId: MEMBER_ID, name: '홍길동', role: 'MEMBER' });
    const { rerender } = renderPanel({ member: first });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));
    await userEvent.click(await screen.findByRole('button', { name: '승급' }));
    // 실패해도 모달은 열린 채로 두고, 오류는 모달 안에서 보여준다.
    const failedDialog = await screen.findByRole('dialog');
    expect(within(failedDialog).getByRole('alert')).toHaveTextContent('권한이 없습니다.');

    // 다른 회원으로 전환 — 앞 회원의 실패를 이 사람 것으로 오독하면 안 된다.
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ApiClientProvider client={apiClient}>
          <MemberDetailPanel
            member={member({ memberId: MEMBER_ID + 1, name: '김철수', role: 'MEMBER' })}
            clubId={CLUB_ID}
            useGeneration
            viewerRole="LEADER"
            viewerUserId={999}
            open
            onClose={() => {}}
            onTransferLeader={() => {}}
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.queryByText('권한이 없습니다.')).not.toBeInTheDocument();
  });
});

describe('MemberDetailPanel — 기수 비우기 활성 조건', () => {
  it('입력칸을 손으로 지워도 비우기는 살아 있다(저장은 검증에 막히는 막다른 길 방지)', async () => {
    renderPanel({ member: member({ generation: 3 }) });

    fireEvent.change(screen.getByLabelText('기수 수정'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: '비우기' })).toBeEnabled();
  });

  it('저장된 기수가 없으면 비우기는 비활성이다', () => {
    renderPanel({ member: member({ generation: null }) });

    expect(screen.getByRole('button', { name: '비우기' })).toBeDisabled();
  });
});
