import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CancelBookingDialog } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/CancelBookingDialog';

describe('CancelBookingDialog', () => {
  // 스피너 svg 는 aria-hidden 이라, 전송 중 통지는 버튼 밖 sr-only role="status" 리전이 맡는다(#914).
  it('취소 요청이 진행 중이면 보조기술에 "예약 신청 취소 중" 상태를 알린다', () => {
    render(
      <CancelBookingDialog
        open
        isPending
        errorMessage={null}
        summaryLabel="9월 23일 · 체육관"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('예약 신청 취소 중');
  });
});
