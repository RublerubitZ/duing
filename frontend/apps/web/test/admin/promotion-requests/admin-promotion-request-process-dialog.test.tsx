import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AdminPromotionRequestDetail } from '@duing/types';

import { AdminPromotionRequestProcessDialog } from '@/app/admin/promotion-requests/_components/AdminPromotionRequestProcessDialog';

const NOTE_VISIBILITY_HINT = '요청한 동아리 운영진에게 그대로 보여요. 거절이면 사유를 적어 주세요.';

function makeDetail(overrides: Partial<AdminPromotionRequestDetail> = {}): AdminPromotionRequestDetail {
  return {
    id: 7,
    club: { id: 10, name: '두잉코드' },
    requester: { id: 3, name: '김회장' },
    title: '2026 가을 정기 공연 홍보',
    description: '정기 공연을 홈 배너로 알리고 싶습니다.',
    suggestedBannerImageUrl: null,
    suggestedLinkUrl: null,
    status: 'PENDING',
    actionNote: null,
    handledBy: null,
    handledAt: null,
    createdAt: '2026-10-20T01:00:00Z',
    ...overrides,
  };
}

const props = {
  request: makeDetail(),
  isPending: false,
  errorMessage: null,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
} satisfies React.ComponentProps<typeof AdminPromotionRequestProcessDialog>;

describe('홍보 요청 처리 다이얼로그', () => {
  it('처리 메모 입력란은 메모가 요청한 운영진에게 그대로 보인다는 안내가 설명으로 읽힌다', () => {
    render(<AdminPromotionRequestProcessDialog {...props} />);

    expect(screen.getByRole('textbox', { name: /처리 메모/ })).toHaveAccessibleDescription(NOTE_VISIBILITY_HINT);
  });

  it('안내는 화면에 보이되 입력란 이름에는 섞이지 않는다 — 라벨 밖에 둔다', () => {
    render(<AdminPromotionRequestProcessDialog {...props} />);

    expect(screen.getByText(NOTE_VISIBILITY_HINT)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /처리 메모/ })).not.toHaveAccessibleName(/그대로 보여요/);
  });
});
