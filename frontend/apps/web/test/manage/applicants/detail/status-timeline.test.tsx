import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusTimeline } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusTimeline';
import type { ApplicationStatusHistoryItem } from '@duing/types';

const historyFixture: ApplicationStatusHistoryItem[] = [
  {
    previousStatus: 'UNDER_REVIEW',
    newStatus: 'INTERVIEW_PENDING',
    changedById: 1,
    changedByName: '김민지',
    changedAt: '2026-06-05T14:23:00',
  },
  {
    previousStatus: 'SUBMITTED',
    newStatus: 'UNDER_REVIEW',
    changedById: 2,
    changedByName: '박지호',
    changedAt: '2026-06-03T10:11:00',
  },
];

describe('StatusTimeline', () => {
  it('최신 항목이 목록 첫 번째에 표시된다 (newest-first)', () => {
    render(
      <StatusTimeline
        history={historyFixture}
        submittedAt="2026-06-01T09:05:00"
      />,
    );

    const items = screen.getAllByRole('listitem');
    // 첫 번째 = INTERVIEW_PENDING (최신)
    expect(items[0]).toHaveTextContent('면접 대기');
    // 마지막 = SUBMITTED 시작점
    expect(items[items.length - 1]).toHaveTextContent('제출됨');
  });

  it('history 가 비어있어도 SUBMITTED 시작점 도트가 표시된다', () => {
    render(<StatusTimeline history={[]} submittedAt="2026-06-01T09:05:00" />);
    expect(screen.getByText('제출됨')).toBeInTheDocument();
  });

  it('변경자 이름이 타임라인 항목에 표시된다', () => {
    render(
      <StatusTimeline
        history={historyFixture}
        submittedAt="2026-06-01T09:05:00"
      />,
    );
    expect(screen.getByText(/김민지/)).toBeInTheDocument();
    expect(screen.getByText(/박지호/)).toBeInTheDocument();
  });

  it('이전 상태와 새 상태가 모두 렌더된다', () => {
    render(
      <StatusTimeline
        history={[historyFixture[0]]}
        submittedAt="2026-06-01T09:05:00"
      />,
    );
    expect(screen.getByText('면접 대기')).toBeInTheDocument();
    expect(screen.getByText(/서류 검토중/)).toBeInTheDocument();
  });
});
