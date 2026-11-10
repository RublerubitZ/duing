import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/admin/_components/home/AdminTriageTiles', () => ({ AdminTriageTiles: () => <div data-testid="tiles" /> }));
vi.mock('@/app/admin/_components/home/AdminTriageQueueCard', () => ({ AdminTriageQueueCard: () => <div data-testid="queue" /> }));
vi.mock('@/app/admin/_components/home/AdminClubSignalsCard', () => ({ AdminClubSignalsCard: () => <div data-testid="signals" /> }));
vi.mock('@/app/admin/_components/home/AdminPendingTrendCard', () => ({ AdminPendingTrendCard: () => <div data-testid="trend" /> }));
vi.mock('@/app/admin/_components/home/AdminFeeAuditCard', () => ({ AdminFeeAuditCard: () => <div data-testid="fee" /> }));
vi.mock('@/app/admin/_components/home/AdminSchoolSyncCard', () => ({ AdminSchoolSyncCard: () => <div data-testid="school" /> }));
vi.mock('@/app/admin/_components/home/AdminJobStatusCard', () => ({ AdminJobStatusCard: () => <div data-testid="jobs" /> }));

import { AdminHomeDashboard } from '@/app/admin/_components/home/AdminHomeDashboard';

describe('AdminHomeDashboard', () => {
  it('좁은 폭에서 쌓이는 순서(DOM 순서)는 칸 → 대기열 → 추이 → 회비 감사 → 자동 작업 → 동아리 현황 → 학교 반영 대기다', () => {
    const { container } = render(<AdminHomeDashboard />);
    const order = Array.from(container.querySelectorAll('[data-testid]')).map((element) => element.getAttribute('data-testid'));
    expect(order).toEqual(['tiles', 'queue', 'trend', 'fee', 'jobs', 'signals', 'school']);
  });

  it('xl 부터 대기열 칸과 오른쪽 320px 칸으로 나뉘고 각 칸은 줄어들 수 있다', () => {
    render(<AdminHomeDashboard />);
    const queueColumn = screen.getByTestId('queue').parentElement!;
    expect(queueColumn).toHaveClass('min-w-0');
    expect(queueColumn.parentElement).toHaveClass('grid', 'xl:grid-cols-[minmax(0,1fr)_320px]');
    const signalsColumn = screen.getByTestId('signals').parentElement!;
    expect(signalsColumn).toHaveClass('min-w-0');
    expect(signalsColumn.firstElementChild).toBe(screen.getByTestId('signals'));
    expect(signalsColumn).toContainElement(screen.getByTestId('school'));
  });

  it('추이와 회비 감사는 대기열 아래에서 sm 부터 나란히 서고, 자동 작업이 그 아래 대기열 칸에 온다', () => {
    render(<AdminHomeDashboard />);
    const queueColumn = screen.getByTestId('queue').parentElement!;
    const pair = screen.getByTestId('trend').parentElement!.parentElement!;
    expect(pair).toHaveClass('grid', 'sm:grid-cols-2');
    expect(pair).toContainElement(screen.getByTestId('fee'));
    expect(screen.getByTestId('fee').parentElement).toHaveClass('min-w-0');
    expect(pair.parentElement).toBe(queueColumn);
    expect(screen.getByTestId('jobs').parentElement).toBe(queueColumn);
  });
});
