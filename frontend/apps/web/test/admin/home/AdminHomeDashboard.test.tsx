import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/admin/_components/home/AdminTriageTiles', () => ({ AdminTriageTiles: () => <div data-testid="tiles" /> }));
vi.mock('@/app/admin/_components/home/AdminTriageQueueCard', () => ({ AdminTriageQueueCard: () => <div data-testid="queue" /> }));
vi.mock('@/app/admin/_components/home/AdminPendingTrendCard', () => ({ AdminPendingTrendCard: () => <div data-testid="trend" /> }));
vi.mock('@/app/admin/_components/home/AdminFeeAuditCard', () => ({ AdminFeeAuditCard: () => <div data-testid="fee" /> }));
vi.mock('@/app/admin/_components/home/AdminSchoolSyncCard', () => ({ AdminSchoolSyncCard: () => <div data-testid="school" /> }));
vi.mock('@/app/admin/_components/home/AdminJobStatusCard', () => ({ AdminJobStatusCard: () => <div data-testid="jobs" /> }));

import { AdminHomeDashboard } from '@/app/admin/_components/home/AdminHomeDashboard';

describe('AdminHomeDashboard', () => {
  it('좁은 폭에서 쌓이는 순서(DOM 순서)는 칸 → 대기열 → 추이 → 회비 감사 → 학교 반영 대기 → 자동 작업이다', () => {
    const { container } = render(<AdminHomeDashboard />);
    const order = Array.from(container.querySelectorAll('[data-testid]')).map((element) => element.getAttribute('data-testid'));
    expect(order).toEqual(['tiles', 'queue', 'trend', 'fee', 'school', 'jobs']);
  });

  it('xl 부터 대기열과 오른쪽 320px 칸으로 나뉘고 각 칸은 줄어들 수 있다', () => {
    render(<AdminHomeDashboard />);
    const queueColumn = screen.getByTestId('queue').parentElement!;
    expect(queueColumn).toHaveClass('min-w-0');
    expect(queueColumn.parentElement).toHaveClass('grid', 'xl:grid-cols-[minmax(0,1fr)_320px]');
    expect(screen.getByTestId('fee').parentElement).toHaveClass('min-w-0');
  });
});
