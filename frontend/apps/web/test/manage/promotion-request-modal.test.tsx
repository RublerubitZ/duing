import { render, screen } from '@testing-library/react';
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
}));

import { PromotionRequestModal } from '../../app/manage/clubs/[clubId]/_components/PromotionRequestModal';

describe('PromotionRequestModal 의 배너 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
    mockSubmit.mockReset();
  });

  it('배너 이미지 영역에 ImageUploader 가 purpose=PROMOTION_REQUEST_BANNER + aspectRatio=16/9 로 렌더된다', () => {
    render(<PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />);
    expect(screen.getByTestId('banner-uploader')).toBeInTheDocument();
    const lastCall = mockImageUploaderCalls.at(-1);
    expect(lastCall?.purpose).toBe('PROMOTION_REQUEST_BANNER');
    expect(lastCall?.aspectRatio).toBe('16/9');
    expect(lastCall?.value).toBe('');
  });

  it('promo-banner-url id 의 URL input 이 더 이상 존재하지 않는다', () => {
    const { container } = render(
      <PromotionRequestModal clubId={1} clubName="두잉" onClose={vi.fn()} />,
    );
    expect(container.querySelector('#promo-banner-url')).toBeNull();
  });
});
