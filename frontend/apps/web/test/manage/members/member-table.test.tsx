import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClubMember } from '@duing/types';
import { MemberTable } from '@/app/manage/clubs/[clubId]/members/_components/MemberTable';

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

const noop = () => {};
const emptySet = new Set<number>();

function renderTable(props: Partial<Parameters<typeof MemberTable>[0]> = {}) {
  return render(
    <MemberTable
      members={[member()]}
      useGeneration
      selectedIds={emptySet}
      onToggleSelect={noop}
      onToggleAll={noop}
      onOpenDetail={noop}
      {...props}
    />,
  );
}

describe('MemberTable — 컬럼 조건부', () => {
  it('useGeneration=true 면 기수 컬럼 헤더와 "N기" 값을 표시한다', () => {
    renderTable({ members: [member({ generation: 3 })] });
    expect(screen.getByRole('columnheader', { name: '기수' })).toBeInTheDocument();
    expect(screen.getAllByText('3기').length).toBeGreaterThan(0);
  });

  it('generation 이 null 이면 기수 값은 "—"', () => {
    renderTable({ members: [member({ generation: null })] });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('useGeneration=false 면 기수 컬럼이 없다', () => {
    renderTable({ members: [member({ generation: 3 })], useGeneration: false });
    expect(screen.queryByRole('columnheader', { name: '기수' })).not.toBeInTheDocument();
  });
});

describe('MemberTable — 회비 표기', () => {
  it('PAID 는 "납부", UNPAID 는 "미납", NONE 은 "—"', () => {
    renderTable({ members: [member({ feeStatus: 'PAID' })] });
    expect(screen.getAllByText('납부').length).toBeGreaterThan(0);

    renderTable({ members: [member({ feeStatus: 'UNPAID' })] });
    expect(screen.getAllByText('미납').length).toBeGreaterThan(0);

    renderTable({ members: [member({ feeStatus: 'NONE', generation: 3 })] });
    // 기수는 값이 있으므로 "—" 는 회비 칸에서만 나온다.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('MemberTable — 선택 콜백', () => {
  it('행 체크박스 변경 시 onToggleSelect 가 memberId 로 호출된다', async () => {
    const onToggleSelect = vi.fn();
    renderTable({ members: [member({ memberId: 42, name: '김철수' })], onToggleSelect });

    const [firstCheckbox] = screen.getAllByRole('checkbox', { name: '김철수 선택' });
    await userEvent.click(firstCheckbox!);

    expect(onToggleSelect).toHaveBeenCalledWith(42);
  });

  it('헤더 전체 선택 체크박스 변경 시 onToggleAll 이 호출된다', async () => {
    const onToggleAll = vi.fn();
    renderTable({ onToggleAll });

    await userEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));

    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it('모든 행이 선택되면 헤더 체크박스가 checked 이다', () => {
    renderTable({
      members: [member({ memberId: 1 }), member({ memberId: 2 })],
      selectedIds: new Set([1, 2]),
    });
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeChecked();
  });
});

describe('MemberTable — 상세 열기', () => {
  it('상세 버튼 클릭 시 onOpenDetail 이 해당 회원으로 호출된다', async () => {
    const onOpenDetail = vi.fn();
    const target = member({ memberId: 7, name: '이영희' });
    renderTable({ members: [target], onOpenDetail });

    await userEvent.click(screen.getByRole('button', { name: '상세' }));

    expect(onOpenDetail).toHaveBeenCalledWith(target);
  });
});

describe('MemberTable — 빈 상태', () => {
  it('members 가 비면 안내 문구를 표시한다', () => {
    renderTable({ members: [] });
    expect(screen.getByText('조건에 맞는 회원이 없어요')).toBeInTheDocument();
  });
});
