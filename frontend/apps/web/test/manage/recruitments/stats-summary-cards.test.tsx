import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { StatsSummary } from '@duing/types';

import { SummaryCards } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/stats/_components/SummaryCards';

const statsSummary: StatsSummary = {
  total: 20,
  submitted: 5,
  onHold: 6,
  interviewPending: 4,
  accepted: 3,
  rejected: 2,
  capacity: 10,
  ratio: 0.3,
};

describe('모집 통계 SummaryCards', () => {
  it('상태 카드 라벨은 운영진 공용 지원 상태 라벨을 따른다', () => {
    render(<SummaryCards statsSummary={statsSummary} />);

    expect(screen.getByText('전체')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    expect(screen.getByText('면접 대상')).toBeInTheDocument();
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('불합격')).toBeInTheDocument();
    // 통계 화면 전용이던 옛 표기는 남지 않는다
    expect(screen.queryByText('면접대기')).not.toBeInTheDocument();
  });
});
