import { render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LatestPromotionRequest } from '@duing/types';

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
let mockSubmitPending = false;
vi.mock('@duing/hooks', () => ({
  useSubmitPromotionRequestMutation: () => ({
    mutate: mockSubmit,
    isPending: mockSubmitPending,
  }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { PromotionRequestModal } from '../../app/manage/clubs/[clubId]/_components/PromotionRequestModal';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

describe('PromotionRequestModal 의 배너 이미지 입력', () => {
  beforeEach(() => {
    mockImageUploaderCalls.length = 0;
    mockSubmit.mockReset();
    mockSubmitPending = false;
  });

  it('배너 이미지 영역에 ImageUploader 가 purpose=PROMOTION_REQUEST_BANNER + aspectRatio=16/9 로 렌더된다', () => {
    render(
      <ToastProvider>
        <PromotionRequestModal clubId={1} clubName="두잉" latestRequest={null} onClose={vi.fn()} />
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
        <PromotionRequestModal clubId={1} clubName="두잉" latestRequest={null} onClose={vi.fn()} />
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
            <PromotionRequestModal
              clubId={1}
              clubName="두잉"
              latestRequest={null}
              onClose={() => setOpen(false)}
            />
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

  // 스피너 svg 는 aria-hidden 이라, 전송 중 통지는 버튼 밖 sr-only role="status" 리전이 맡는다(#914).
  it('요청 제출이 진행 중이면 보조기술에 "홍보 요청 보내는 중" 상태를 알린다', () => {
    mockSubmitPending = true;
    render(
      <ToastProvider>
        <PromotionRequestModal clubId={1} clubName="두잉" latestRequest={null} onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('홍보 요청 보내는 중');
  });
});

describe('PromotionRequestModal 의 최근 요청 카드', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockSubmitPending = false;
  });

  function latestRequest(overrides: Partial<LatestPromotionRequest> = {}): LatestPromotionRequest {
    return {
      requestId: 3,
      status: 'ACCEPTED',
      title: '가을 정기 공연 홍보',
      actionNote: '다음 주 월요일부터 게시합니다.',
      // 둘 다 KST 자정 직후 — UTC 날짜를 그대로 쓰면 하루씩 어긋난다.
      createdAt: '2026-10-01T15:10:00Z',
      handledAt: '2026-10-03T15:20:00Z',
      ...overrides,
    };
  }

  function renderModal(latest: LatestPromotionRequest | null) {
    return render(
      <ToastProvider>
        <PromotionRequestModal clubId={1} clubName="두잉" latestRequest={latest} onClose={vi.fn()} />
      </ToastProvider>,
    );
  }

  it('최근 요청의 상태·제목·제출일·처리일·처리 메모를 보여 준다', () => {
    renderModal(latestRequest());

    const card = screen.getByRole('region', { name: '최근 홍보 요청' });
    expect(within(card).getByText('수락됨')).toBeInTheDocument();
    expect(within(card).getByText('가을 정기 공연 홍보')).toBeInTheDocument();
    expect(within(card).getByText('제출일').nextElementSibling).toHaveTextContent('2026.10.02');
    expect(within(card).getByText('처리일').nextElementSibling).toHaveTextContent('2026.10.04');
    expect(within(card).getByText('처리 메모').nextElementSibling).toHaveTextContent('다음 주 월요일부터 게시합니다.');
  });

  it('처리 메모가 없으면(null) 메모 줄을 그리지 않는다', () => {
    renderModal(latestRequest({ status: 'REJECTED', actionNote: null }));

    const card = screen.getByRole('region', { name: '최근 홍보 요청' });
    expect(within(card).getByText('거절됨')).toBeInTheDocument();
    expect(within(card).queryByText('처리 메모')).not.toBeInTheDocument();
  });

  it('검토 대기 중이면 처리일 줄 없이 제출일만 보여 준다', () => {
    renderModal(latestRequest({ status: 'PENDING', actionNote: null, handledAt: null }));

    const card = screen.getByRole('region', { name: '최근 홍보 요청' });
    expect(within(card).getByText('검토 대기 중')).toBeInTheDocument();
    expect(within(card).getByText('제출일')).toBeInTheDocument();
    expect(within(card).queryByText('처리일')).not.toBeInTheDocument();
  });

  it('요청한 적이 없으면 카드를 그리지 않는다', () => {
    renderModal(null);

    expect(screen.queryByRole('region', { name: '최근 홍보 요청' })).not.toBeInTheDocument();
  });
});
