import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BulkPromoteDialog } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/BulkPromoteDialog';

describe('BulkPromoteDialog', () => {
  it('제목 "면접 대상자 선정" 이 dialog 의 aria-labelledby 로 노출된다', () => {
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={6}
        isPending={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('dialog', { name: '면접 대상자 선정' })).toBeInTheDocument();
  });

  it('대표 이름 + (N-1)명 본문 + 자동배정 안내 문구를 표시한다', () => {
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={6}
        isPending={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/홍길동 외 5명을/)).toBeInTheDocument();
    expect(screen.getByText(/면접 대상자로 선정하시겠습니까\?/)).toBeInTheDocument();
    expect(
      screen.getByText('선정된 지원자는 자동배정 대상에 포함됩니다.'),
    ).toBeInTheDocument();
  });

  it('selectedCount=1 이면 "외 0명" 으로 표시된다', () => {
    render(
      <BulkPromoteDialog
        representativeName="김두잉"
        selectedCount={1}
        isPending={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/김두잉 외 0명을/)).toBeInTheDocument();
  });

  it('representativeName 이 빈 문자열이면 "선택한 N명을" fallback 으로 표시된다', () => {
    // selection 후 filter/search 가 변경되어 선택된 지원자가 visible list 에서
    // 사라진 케이스 — 대표 이름 없이도 본문이 의미를 유지해야 한다.
    render(
      <BulkPromoteDialog
        representativeName=""
        selectedCount={3}
        isPending={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/선택한 3명을/)).toBeInTheDocument();
    expect(screen.getByText(/면접 대상자로 선정하시겠습니까\?/)).toBeInTheDocument();
  });

  it('"선정" 버튼 클릭 시 onConfirm 이 호출된다', async () => {
    const onConfirm = vi.fn();
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={3}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '선정' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('"취소" 버튼 클릭 시 onCancel 이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={3}
        isPending={false}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('isPending=true 면 두 버튼이 모두 disabled 이고 "선정" 라벨이 "처리 중…" 으로 바뀐다', () => {
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={3}
        isPending
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled();
  });

  it('ESC 키 입력 시 onCancel 이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <BulkPromoteDialog
        representativeName="홍길동"
        selectedCount={3}
        isPending={false}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
