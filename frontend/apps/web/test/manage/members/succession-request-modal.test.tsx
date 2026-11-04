import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LatestLeaderSuccessionRequest } from '@duing/types';

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
        <SuccessionRequestModal clubId={1} clubName="두잉" latestRequest={null} onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('승계 요청 보내는 중');
  });
});

describe('SuccessionRequestModal 의 내 최근 요청 카드', () => {
  function latestRequest(overrides: Partial<LatestLeaderSuccessionRequest> = {}): LatestLeaderSuccessionRequest {
    return {
      requestId: 5,
      status: 'REJECTED',
      reason: '회장이 두 달째 연락이 닿지 않습니다.',
      actionNote: '현 회장과 연락이 닿았습니다. 다시 확인해 주세요.',
      // 둘 다 KST 자정 직후 — UTC 날짜를 그대로 쓰면 하루씩 어긋난다.
      createdAt: '2026-10-01T15:10:00Z',
      handledAt: '2026-10-03T15:20:00Z',
      ...overrides,
    };
  }

  function renderModal(latest: LatestLeaderSuccessionRequest | null) {
    return render(
      <ToastProvider>
        <SuccessionRequestModal clubId={1} clubName="두잉" latestRequest={latest} onClose={vi.fn()} />
      </ToastProvider>,
    );
  }

  it('내 최근 요청의 상태·제출일·처리일·요청 사유·처리 메모를 보여 준다', () => {
    renderModal(latestRequest());

    const card = screen.getByRole('region', { name: '내 최근 승계 요청' });
    expect(within(card).getByText('거절됨')).toBeInTheDocument();
    expect(within(card).getByText('제출일').nextElementSibling).toHaveTextContent('2026.10.02');
    expect(within(card).getByText('처리일').nextElementSibling).toHaveTextContent('2026.10.04');
    expect(within(card).getByText('요청 사유').nextElementSibling).toHaveTextContent('회장이 두 달째 연락이 닿지 않습니다.');
    expect(within(card).getByText('처리 메모').nextElementSibling).toHaveTextContent(
      '현 회장과 연락이 닿았습니다. 다시 확인해 주세요.',
    );
  });

  it('처리 메모가 없으면(null) 메모 줄을 그리지 않는다', () => {
    renderModal(latestRequest({ status: 'APPROVED', actionNote: null }));

    const card = screen.getByRole('region', { name: '내 최근 승계 요청' });
    expect(within(card).getByText('승인됨')).toBeInTheDocument();
    expect(within(card).queryByText('처리 메모')).not.toBeInTheDocument();
  });

  it('검토 대기 중이면 처리일 줄 없이 제출일과 사유만 보여 준다', () => {
    renderModal(latestRequest({ status: 'PENDING', actionNote: null, handledAt: null }));

    const card = screen.getByRole('region', { name: '내 최근 승계 요청' });
    expect(within(card).getByText('검토 대기 중')).toBeInTheDocument();
    expect(within(card).getByText('요청 사유')).toBeInTheDocument();
    expect(within(card).queryByText('처리일')).not.toBeInTheDocument();
  });

  // 사유·메모가 각각 최대 1000자라 카드만으로 뷰포트를 넘길 수 있다 — 제출·닫기 버튼에 닿도록 창 안에서 스크롤한다.
  it('창 높이를 뷰포트 85% 로 제한하고 넘치면 안에서 스크롤한다', () => {
    renderModal(latestRequest());

    expect(screen.getByRole('dialog')).toHaveClass('max-h-[85vh]', 'overflow-y-auto');
  });

  it('요청한 적이 없으면 카드를 그리지 않는다', () => {
    renderModal(null);

    expect(screen.queryByRole('region', { name: '내 최근 승계 요청' })).not.toBeInTheDocument();
  });
});
