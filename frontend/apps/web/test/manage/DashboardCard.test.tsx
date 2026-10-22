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

  it('조회에 실패해 비었으면 빈 문구·배지·푸터 대신 오류 안내를 표시한다', () => {
    render(
      <DashboardCard title="처리 필요 업무" badge={<span>0</span>} isError isEmpty emptyText="처리할 업무가 없어요" footer={<p>전체 보기</p>}>
        <div>내용</div>
      </DashboardCard>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByText('처리할 업무가 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('전체 보기')).not.toBeInTheDocument();
    expect(screen.queryByText('내용')).not.toBeInTheDocument();
  });

  it('조회 일부가 실패해도 받은 내용·배지·푸터는 두고 아래에 한 줄 안내를 붙인다', () => {
    render(
      <DashboardCard title="처리 필요 업무" badge={<span>3</span>} isError emptyText="없음" footer={<p>전체 보기</p>}>
        <div>내용</div>
      </DashboardCard>,
    );
    expect(screen.getByText('내용')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('전체 보기')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('로딩 중에는 오류 안내를 표시하지 않는다', () => {
    render(<DashboardCard title="오늘 일정" isLoading isError isEmpty emptyText="오늘 일정이 없어요"><div>내용</div></DashboardCard>);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('일부 정보를 불러오지 못했어요.')).not.toBeInTheDocument();
  });
});
