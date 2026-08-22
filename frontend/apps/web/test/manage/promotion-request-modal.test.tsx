import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockImageUploaderCalls: Array<{
  value: string;
  purpose: string;
  aspectRatio?: string;
}> = [];

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
  }) => {
    mockImageUploaderCalls.push({
      value: props.value,
      purpose: props.purpose,
      aspectRatio: props.aspectRatio,
    });
    return (
      <input
        data-testid="banner-uploader"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

const mockSubmit = vi.fn();
vi.mock('@duing/hooks', () => ({
  useSubmitPromotionRequestMutation: () => ({
    mutate: mockSubmit,
    isPending: false,
  }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { PromotionRequestModal } from '../../app/manage/clubs/[clubId]/_components/PromotionRequestModal';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

describe('PromotionRequestModal 의 배너 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
    mockSubmit.mockReset();
  });

  it('배너 이미지 영역에 ImageUploader 가 purpose=PROMOTION_REQUEST_BANNER + aspectRatio=16/9 로 렌더된다', () => {
    render(
      <ToastProvider>
        <PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByTestId('banner-uploader')).toBeInTheDocument();
    const lastCall = mockImageUploaderCalls.at(-1);
    expect(lastCall?.purpose).toBe('PROMOTION_REQUEST_BANNER');
    expect(lastCall?.aspectRatio).toBe('16/9');
    expect(lastCall?.value).toBe('');
  });

  it('promo-banner-url id 의 URL input 이 더 이상 존재하지 않는다', () => {
    const { container } = render(
      <ToastProvider>
        <PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(container.querySelector('#promo-banner-url')).toBeNull();
  });

  it('접수 완료 안내는 모달을 닫은 뒤에도 토스트로 남는다', async () => {
    // 안내는 onClose 직후에 뜬다 — 모달 안에 그렸다면 언마운트와 함께 사라진다.
    // ToastProvider 가 라우트 트리보다 위에 있어야 성립하는 동작을 실제 닫힘으로 고정한다.
    mockSubmit.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ToastProvider>
          {open && (
            <PromotionRequestModal clubId={1} clubName="두잉" onClose={() => setOpen(false)} />
          )}
        </ToastProvider>
      );
    }

    render(<Harness />);

    await userEvent.type(screen.getByPlaceholderText('홍보 배너에 표시될 제목'), '홍보 요청 제목');
    await userEvent.type(
      screen.getByPlaceholderText('동아리 소개 및 홍보 내용을 구체적으로 작성해주세요.'),
      '홍보 요청 설명입니다.',
    );
    await userEvent.click(screen.getByRole('button', { name: '홍보 요청 제출' }));

    // 모달이 사라진 뒤에도 안내가 남아 있어야 한다.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent(
      '홍보 요청이 접수되었습니다. 총동연 검토 후 처리됩니다.',
    );
  });
});
