import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubMember } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { runBulkMemberAction } from '@/app/manage/clubs/[clubId]/members/_lib/runBulkMemberAction';
import { MemberBulkToolbar } from '@/app/manage/clubs/[clubId]/members/_components/MemberBulkToolbar';

// ── runBulkMemberAction: 순수 오케스트레이션 ─────────────────────────────
describe('runBulkMemberAction', () => {
  it('순차로 실행한다 — 호출 순서가 입력 순서와 같고 동시에 겹치지 않는다', async () => {
    const order: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    await runBulkMemberAction([10, 20, 30], async (id) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(id);
      await Promise.resolve();
      inFlight -= 1;
    });

    expect(order).toEqual([10, 20, 30]);
    expect(maxInFlight).toBe(1);
  });

  it('한 건이 실패해도 멈추지 않고 부분 실패를 수집한다', async () => {
    const result = await runBulkMemberAction([1, 2, 3], async (id) => {
      if (id === 2) throw new Error('권한이 없어요');
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toEqual([{ id: 2, message: '권한이 없어요' }]);
  });

  it('Error 가 아닌 값으로 실패하면 기본 메시지를 담는다', async () => {
    const result = await runBulkMemberAction([1], async () => {
      throw 'boom';
    });

    expect(result.failed).toEqual([{ id: 1, message: '처리 실패' }]);
  });
});

// ── MemberBulkToolbar: 통합(MSW) ────────────────────────────────────────
const CLUB_ID = 7;
const BASE = 'http://localhost:8080/api/v1';

let roleCalls: { memberId: number; role: unknown }[] = [];
let generationCalls: { memberId: number; generation: unknown }[] = [];
let removeCalls: number[] = [];
let failingRoleIds: Set<number> = new Set();

const server = setupServer(
  http.patch(`${BASE}/clubs/${CLUB_ID}/members/:memberId/role`, async ({ request, params }) => {
    const memberId = Number(params.memberId);
    const body = (await request.json()) as { role: unknown };
    roleCalls.push({ memberId, role: body.role });
    if (failingRoleIds.has(memberId)) return new HttpResponse(null, { status: 500 });
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch(`${BASE}/clubs/${CLUB_ID}/members/:memberId/generation`, async ({ request, params }) => {
    const memberId = Number(params.memberId);
    const body = (await request.json()) as { generation: unknown };
    generationCalls.push({ memberId, generation: body.generation });
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete(`${BASE}/clubs/${CLUB_ID}/members/:memberId`, ({ params }) => {
    removeCalls.push(Number(params.memberId));
    return new HttpResponse(null, { status: 204 });
  }),
);

const apiClient = createApiClient({ baseUrl: BASE });

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  roleCalls = [];
  generationCalls = [];
  removeCalls = [];
  failingRoleIds = new Set();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// Radix Dialog 가 참조하는 matchMedia 를 jsdom 에 스텁한다.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
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
    memberId: 1,
    userId: 1,
    name: '홍길동',
    studentId: '20200001',
    role: 'MEMBER',
    joinedAt: '2026-05-01',
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    phoneMasked: null,
    generation: 3,
    feeStatus: 'PAID',
    ...overrides,
  };
}

const LEADER = member({ memberId: 1, name: '김회장', role: 'LEADER' });
const M2 = member({ memberId: 2, name: '이몽룡', role: 'MEMBER' });
const M3 = member({ memberId: 3, name: '성춘향', role: 'MEMBER' });

function renderToolbar(props: Partial<Parameters<typeof MemberBulkToolbar>[0]> = {}) {
  const onDone = vi.fn();
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
      <MemberBulkToolbar
        clubId={CLUB_ID}
        members={[LEADER, M2, M3]}
        selectedIds={new Set([1, 2, 3])}
        useGeneration
        onDone={onDone}
        {...props}
      />,
    ),
  );
  return { ...utils, onDone };
}

describe('MemberBulkToolbar — 회장(LEADER) 스킵', () => {
  it('승급 시 회장은 대상에서 제외하고 요약에 표기한다', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: /임원 승급/ }));

    await waitFor(() => expect(roleCalls.length).toBe(2));
    // 회장(id 1)에게는 요청하지 않는다.
    expect(roleCalls.map((call) => call.memberId).sort()).toEqual([2, 3]);
    expect(roleCalls.every((call) => call.role === 'OFFICER')).toBe(true);

    const status = await screen.findByRole('status');
    expect(within(status).getByText(/2명 처리/)).toBeInTheDocument();
    expect(within(status).getByText(/김회장/)).toBeInTheDocument();
  });
});

describe('MemberBulkToolbar — 기수 변경 조건부 노출', () => {
  it('useGeneration=false 면 기수 변경 버튼이 없다', () => {
    renderToolbar({ useGeneration: false });
    expect(screen.queryByRole('button', { name: /기수 변경/ })).not.toBeInTheDocument();
  });

  it('useGeneration=true 면 다이얼로그 입력 후 선택 전원에 일괄 적용한다', async () => {
    const user = userEvent.setup();
    // 회장 없이 부원 2명만 선택 — 기수는 회장도 대상이지만 여기선 부원만.
    renderToolbar({ members: [M2, M3], selectedIds: new Set([2, 3]) });

    await user.click(screen.getByRole('button', { name: /기수 변경/ }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('기수');

    // 0 은 검증 실패.
    await user.type(input, '0');
    await user.click(within(dialog).getByRole('button', { name: '변경' }));
    expect(within(dialog).getByText('기수는 1 이상의 정수여야 해요')).toBeInTheDocument();
    expect(generationCalls.length).toBe(0);

    await user.clear(input);
    await user.type(input, '5');
    await user.click(within(dialog).getByRole('button', { name: '변경' }));

    await waitFor(() => expect(generationCalls.length).toBe(2));
    expect(generationCalls.every((call) => call.generation === 5)).toBe(true);
    expect(await screen.findByText(/기수 5기로 변경 — 2명 처리/)).toBeInTheDocument();
  });
});

describe('MemberBulkToolbar — 탈퇴 확인 경유', () => {
  it('확인 다이얼로그를 거쳐야 탈퇴가 실행되고 회장은 제외한다', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: /^탈퇴/ }));

    // 아직 삭제 요청 없음.
    expect(removeCalls.length).toBe(0);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/탈퇴 처리할까요/)).toBeInTheDocument();
    // 회장 제외 → 부원 2명만 대상.
    expect(within(dialog).getByText(/2명을/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    await waitFor(() => expect(removeCalls.length).toBe(2));
    expect(removeCalls.sort()).toEqual([2, 3]);
    expect(await screen.findByText(/탈퇴 처리 — 2명 처리/)).toBeInTheDocument();
  });
});

describe('MemberBulkToolbar — 부분 실패 요약', () => {
  it('일부 실패하면 처리/실패 수와 실패 대상 이름을 요약에 렌더한다', async () => {
    const user = userEvent.setup();
    failingRoleIds = new Set([3]);
    renderToolbar({ members: [M2, M3], selectedIds: new Set([2, 3]) });

    await user.click(screen.getByRole('button', { name: /임원 승급/ }));

    const status = await screen.findByRole('status');
    await waitFor(() => expect(within(status).getByText(/1명 처리/)).toBeInTheDocument());
    expect(within(status).getByText(/1명 실패/)).toBeInTheDocument();
    // 실패 목록에 대상 이름이 보인다.
    expect(within(status).getByText(/성춘향/)).toBeInTheDocument();
  });
});
