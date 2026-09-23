import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@duing/hooks', () => ({
  useSubmitSuccessionRequestMutation: () => ({ mutate: vi.fn(), isPending: true }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { SuccessionRequestModal } from '@/app/manage/clubs/[clubId]/members/_components/SuccessionRequestModal';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

describe('SuccessionRequestModal', () => {
  // 스피너 svg 는 aria-hidden 이라, 전송 중 통지는 버튼 밖 sr-only role="status" 리전이 맡는다(#914).
  it('요청 제출이 진행 중이면 보조기술에 "승계 요청 보내는 중" 상태를 알린다', () => {
    render(
      <ToastProvider>
        <SuccessionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('승계 요청 보내는 중');
  });
});
