import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardCard } from '@/app/manage/_components/dashboard/DashboardCard';

describe('DashboardCard', () => {
  it('로딩 상태를 표시한다', () => {
    render(<DashboardCard title="처리 필요 업무" isLoading emptyText="없음"><div>내용</div></DashboardCard>);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('내용')).not.toBeInTheDocument();
  });

  it('빈 상태를 표시한다', () => {
    render(<DashboardCard title="오늘 일정" isEmpty emptyText="오늘 일정이 없어요"><div>내용</div></DashboardCard>);
    expect(screen.getByText('오늘 일정이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('내용')).not.toBeInTheDocument();
  });

  it('정상 상태에서 children과 badge를 표시한다', () => {
    render(<DashboardCard title="처리 필요 업무" badge={<span>3</span>} emptyText="없음"><div>내용</div></DashboardCard>);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
  });
});
