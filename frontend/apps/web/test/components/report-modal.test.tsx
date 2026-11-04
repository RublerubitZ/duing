import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mockSubmitReportMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useSubmitReportMutation: () => ({ mutate: mockSubmitReportMutate, isPending: false, isError: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { ReportModal } from '@/components/report/ReportModal';

describe('ReportModal', () => {
  // zodResolver 가 스키마에 단 한국어 문구를 필드 오류로 넘기는지 본다 — 문구가 무시되면 영어 기본 문구가 뜬다.
  it('신고 사유를 고르지 않고 접수하면 "신고 사유를 선택해주세요." 를 띄우고 접수하지 않는다', async () => {
    const user = userEvent.setup();
    render(<ReportModal targetType="CLUB" targetId={1} targetLabel="두잉" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '신고 접수' }));

    expect(await screen.findByText('신고 사유를 선택해주세요.')).toBeInTheDocument();
    expect(mockSubmitReportMutate).not.toHaveBeenCalled();
  });
});
