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

beforeAll(() => server.listen());
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

describe('MemberDetailPanel — 연락처 복사', () => {
  it('복사 버튼 클릭 시 phoneMasked 를 clipboard 에 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '연락처 복사' }));

    expect(writeText).toHaveBeenCalledWith('010-****-5678');
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });

  it('clipboard 미지원이면 에러 톤 피드백을 보인다', async () => {
    Object.assign(navigator, { clipboard: undefined });
    renderPanel({ member: member({ phoneMasked: '010-****-5678' }) });

    await userEvent.click(screen.getByRole('button', { name: '연락처 복사' }));

    expect(await screen.findByText('복사 실패')).toBeInTheDocument();
  });

  it('연락처가 없으면 복사 버튼 대신 "—"', () => {
    renderPanel({ member: member({ phoneMasked: null }) });
    expect(screen.queryByRole('button', { name: '연락처 복사' })).not.toBeInTheDocument();
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

  it('OFFICER 뷰어는 타인 행에서 관리 섹션이 숨겨진다', () => {
    renderPanel({ viewerRole: 'OFFICER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });
    expect(screen.queryByText('관리')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '임원으로 승급' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '강퇴' })).not.toBeInTheDocument();
  });

  it('OFFICER 뷰어는 본인 행에서 탈퇴만 노출한다', () => {
    renderPanel({
      viewerRole: 'OFFICER',
      viewerUserId: 100,
      member: member({ userId: 100, role: 'OFFICER' }),
    });
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ role: 'MEMBER' }) });

    await userEvent.click(screen.getByRole('button', { name: '임원으로 승급' }));

    await waitFor(() => expect(capturedRoleBody).toEqual({ role: 'OFFICER' }));
  });

  it('기수 저장은 generation PATCH 를 정수로 보낸다', async () => {
    renderPanel({ viewerRole: 'LEADER', viewerUserId: 999, member: member({ generation: 3 }) });

    const input = screen.getByLabelText('기수 수정');
    fireEvent.change(input, { target: { value: '12' } });
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
