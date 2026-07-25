import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClubMember } from '@duing/types';
import { TransferLeaderDialog } from '@/app/manage/clubs/[clubId]/members/_components/TransferLeaderDialog';

const target: ClubMember = {
  memberId: 2,
  userId: 12,
  name: '김철수',
  studentId: '20200002',
  role: 'OFFICER',
  joinedAt: '2024-01-10',
  major: '경영학과',
  grade: 'JUNIOR',
  phoneMasked: null,
  generation: 3,
  feeStatus: 'PAID',
};

const noop = () => {};

describe('TransferLeaderDialog — 역할 표기', () => {
  it('대상 역할과 인계 후 본인 역할을 한글 라벨로 보여준다(enum 원문 노출 금지)', () => {
    render(
      <TransferLeaderDialog
        target={target}
        clubName="두잉 코딩"
        isPending={false}
        onConfirm={noop}
        onCancel={noop}
      />,
    );

    expect(screen.getByText(/학번 20200002 · 임원/)).toBeInTheDocument();
    expect(screen.getByText(/본인은 임원이 됩니다/)).toBeInTheDocument();
    expect(screen.queryByText(/OFFICER/)).not.toBeInTheDocument();
  });
});
