import { render, screen } from '@testing-library/react';
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
  return { data: rows, isLoading: false, isError: false };
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
    mockApplicationsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    expect(() => renderPage('42')).not.toThrow();
  });
});
