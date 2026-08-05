import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ApplicationsPage } from '@/app/me/applications/_pages/ApplicationsPage';

// 딥링크(/me/applications/{id})로 남의 지원서나 없는 지원서를 열면, 예전에는 서버의 403·404 가
// 삼켜지고 평범한 목록만 렌더돼 학생이 무엇이 잘못됐는지 알 수 없었다.

const mockApplicationsQuery = vi.fn();
const notFoundSignal = new Error('NEXT_NOT_FOUND');

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundSignal;
  },
}));

// 실제 훅 모듈을 그대로 들이면 ApiClientProvider 를 요구한다 — 날짜 헬퍼만 진짜를 쓰고 훅은 대체한다.
vi.mock('@duing/hooks', async () => ({
  ...(await import('@duing/hooks/datetime')),
  useMyApplicationsQuery: () => mockApplicationsQuery(),
  useMyApplicationDetailQuery: () => ({ data: undefined }),
  useMyInterviewQuery: () => ({ data: undefined }),
  useWithdrawApplicationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/app/_components/ExploreNav', () => ({ ExploreNav: () => null }));

const summary = {
  id: 42,
  recruitmentId: 7,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus: 'OPEN' as const,
  clubId: 3,
  clubName: '두잉',
  category: 'HOBBY' as const,
  logoUrl: null,
  status: 'SUBMITTED' as const,
  interview: null,
  submittedAt: '2026-06-01T01:00:00Z',
};

function loaded(rows: (typeof summary)[]) {
  return { data: rows, isLoading: false, isFetching: false, isError: false };
}

function renderPage(defaultOpenId: string) {
  return render(
    <ToastProvider>
      <ApplicationsPage defaultOpenId={defaultOpenId} />
    </ToastProvider>,
  );
}

describe('내 지원 딥링크', () => {
  beforeEach(() => {
    mockApplicationsQuery.mockReset();
  });

  it('내 지원서를 가리키는 딥링크는 그대로 목록을 연다', () => {
    mockApplicationsQuery.mockReturnValue(loaded([summary]));

    renderPage('42');

    expect(screen.getAllByText('두잉').length).toBeGreaterThan(0);
  });

  it('목록에 없는 지원서를 가리키면 평범한 목록 대신 404 로 끊는다', () => {
    mockApplicationsQuery.mockReturnValue(loaded([summary]));

    expect(() => renderPage('999')).toThrow(notFoundSignal);
  });

  it('아직 목록을 불러오는 중에는 404 로 끊지 않는다', () => {
    // 로딩 중에 끊으면 정상 딥링크도 응답을 기다리는 사이에 404 가 된다.
    mockApplicationsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    expect(() => renderPage('42')).not.toThrow();
  });

  it('목록 조회 자체가 실패하면 404 가 아니라 오류 안내를 보여준다', () => {
    // 통신 실패와 "그 지원서가 없다"는 다른 사실이다 — 섞으면 장애를 404 로 오해하게 만든다.
    mockApplicationsQuery.mockReturnValue({
      data: undefined, isLoading: false, isFetching: false, isError: true,
    });

    expect(() => renderPage('42')).not.toThrow();
  });

  it('딥링크로 연 모달을 닫아도 404 가 아니라 목록이 남는다', async () => {
    // 가드가 상태(openId)가 아니라 prop(defaultOpenId)만 보면, 닫기·백드롭·뒤로가기·철회 성공이
    // 전부 404 가 된다 — 철회는 목록에서 그 지원까지 지우므로 특히 되돌릴 수 없다.
    mockApplicationsQuery.mockReturnValue(loaded([summary]));

    renderPage('42');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText('두잉').length).toBeGreaterThan(0);
  });

  it('쿼리가 아직 비활성이라 답이 없는 프레임에서는 404 로 끊지 않는다', () => {
    // useMyApplicationsQuery 는 enabled: isAuthenticated 라 서버 렌더에서 꺼져 있다.
    // isLoading 은 isPending && isFetching 이므로 이 프레임에서 false — "답이 왔다"로 읽으면 안 된다.
    mockApplicationsQuery.mockReturnValue({
      data: undefined, isLoading: false, isFetching: false, isError: false,
    });

    expect(() => renderPage('42')).not.toThrow();
  });

  it('옛 목록을 든 채 재검증 중이면 404 로 끊지 않는다', () => {
    // 지원 제출은 invalidateQueries 만 하므로 비활성 쿼리는 옛 목록을 그대로 들고 stale 표시만 된다.
    // 그 목록에는 방금 낸 지원이 없고 isLoading 도 false 라, 재검증 중 판정하면 정상 딥링크가 404 다.
    mockApplicationsQuery.mockReturnValue({
      data: [summary], isLoading: false, isFetching: true, isError: false,
    });

    expect(() => renderPage('99')).not.toThrow();
  });
});
