import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdminClubPendingCleanupDialog } from '@/app/admin/clubs/_components/AdminClubPendingCleanupDialog';

type DialogProps = Parameters<typeof AdminClubPendingCleanupDialog>[0];

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    clubName: '쉬는 동아리',
    counts: { applications: 3, joinRequests: 1 },
    isPending: false,
    errorMessage: null,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<AdminClubPendingCleanupDialog {...props} />);
  return props;
}

describe('AdminClubPendingCleanupDialog', () => {
  it('제목과 본문 4줄을 보이고, 본문 목록이 창 설명으로 읽힌다', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '쉬는 동아리의 남은 미결을 정리할까요?' });
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      "지원서 3건은 불합격으로 바뀌어요. 지원자에게는 '동아리 운영 중단으로 선발이 끝났어요'로 보여요.",
      '가입 신청 1건은 거절돼요.',
      '알림은 보내지 않아요.',
      '되돌릴 수 없어요.',
    ]);
    expect(dialog).toHaveAccessibleDescription(/지원서 3건은 불합격으로 바뀌어요/);
  });

  it.each([
    ['가입 신청만', { applications: 0, joinRequests: 2 }, '지원서'],
    ['지원서만', { applications: 2, joinRequests: 0 }, '가입 신청'],
  ])('%s 남았으면 0건인 쪽 줄을 뺀다', (_label, counts, absentWord) => {
    renderDialog({ counts });
    const lines = within(screen.getByRole('dialog')).getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines.some((line) => line.includes(absentWord))).toBe(false);
  });

  it('정리하기·취소는 각 콜백을 부른다', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: '정리하기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('처리 중에는 "정리하는 중…"으로 두 버튼을 막고 처리 중임을 알린다', () => {
    renderDialog({ isPending: true });
    expect(screen.getByRole('button', { name: '정리하는 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('남은 미결 정리 중');
  });

  it('실패 문구는 창 안에 경고로 보인다', () => {
    renderDialog({ errorMessage: '운영 중단 동아리만 남은 미결을 정리할 수 있어요.' });
    expect(screen.getByRole('alert')).toHaveTextContent('운영 중단 동아리만 남은 미결을 정리할 수 있어요.');
  });
});
