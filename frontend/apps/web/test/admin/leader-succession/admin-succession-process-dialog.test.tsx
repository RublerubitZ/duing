import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AdminSuccessionDetail } from '@duing/types';

import { AdminSuccessionProcessDialog } from '@/app/admin/leader-succession/_components/AdminSuccessionProcessDialog';

const NOTE_VISIBILITY_HINT = '요청한 임원에게 그대로 보여요. 거절이면 사유를 적어 주세요.';

function makeDetail(overrides: Partial<AdminSuccessionDetail> = {}): AdminSuccessionDetail {
  return {
    id: 4,
    club: { id: 10, name: '두잉코드' },
    requester: { id: 5, name: '이부회장' },
    currentLeader: { id: 3, name: '김회장' },
    reason: '현 회장이 휴학해 회장직을 넘겨받으려 합니다.',
    status: 'PENDING',
    actionNote: null,
    handledBy: null,
    handledAt: null,
    createdAt: '2026-10-20T01:00:00Z',
    ...overrides,
  };
}

const props = {
  succession: makeDetail(),
  isPending: false,
  errorMessage: null,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
} satisfies React.ComponentProps<typeof AdminSuccessionProcessDialog>;

describe('승계 요청 처리 다이얼로그', () => {
  it('처리 메모 입력란은 메모가 요청한 임원에게 그대로 보인다는 안내가 설명으로 읽힌다', () => {
    render(<AdminSuccessionProcessDialog {...props} />);

    expect(screen.getByRole('textbox', { name: /처리 메모/ })).toHaveAccessibleDescription(NOTE_VISIBILITY_HINT);
  });

  it('안내는 화면에 보이되 입력란 이름에는 섞이지 않는다 — 라벨 밖에 둔다', () => {
    render(<AdminSuccessionProcessDialog {...props} />);

    expect(screen.getByText(NOTE_VISIBILITY_HINT)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /처리 메모/ })).not.toHaveAccessibleName(/그대로 보여요/);
  });
});
