import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import { MyEvaluationCard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/MyEvaluationCard';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import type { ApplicationEvaluation } from '@duing/types';

const mockUpsert = vi.fn();
const mockDelete = vi.fn();

vi.mock('@duing/hooks', () => ({
  useUpsertMyApplicationEvaluationMutation: () => ({
    mutateAsync: mockUpsert,
    isPending: false,
  }),
  useDeleteMyApplicationEvaluationMutation: () => ({
    mutateAsync: mockDelete,
  }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const existingEvaluation: ApplicationEvaluation = {
  evaluatorId: 1,
  evaluatorName: '나',
  score: 4,
  memo: '기존 메모',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe('MyEvaluationCard', () => {
  it('빈 상태에서 폼이 노출되고 저장 시 upsert mutation 이 호출된다', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={null} />);

    expect(screen.getByText('내 평가')).toBeInTheDocument();
    // placeholder 는 accessible name 이 아니다 — 라벨이 생겼으니 role 로 잡는다.
    // placeholder 자체는 예시 문구로 계속 필요하므로 함께 못박는다.
    const memoField = screen.getByRole('textbox', { name: '메모' });
    expect(memoField.getAttribute('placeholder')).toContain('강점, 약점');
    expect(
      screen.getByText('메모는 평가 근거 작성에 사용됩니다. 지원자에게는 공개되지 않습니다.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpsert).toHaveBeenCalledWith({
      applicationId: 1,
      payload: { score: 3, memo: null },
    });
  });

  it('기존 평가가 있을 때 카드 뷰를 표시하고 수정 버튼으로 폼 전환이 된다', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('기존 메모')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '메모' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByRole('textbox', { name: '메모' })).toBeInTheDocument();
  });

  it('수정 모드에서 저장하면 현재 score 와 memo 로 upsert mutation 을 호출한다', async () => {
    wrap(<MyEvaluationCard applicationId={2} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    const textarea = screen.getByRole('textbox', { name: '메모' });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '새 메모');

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpsert).toHaveBeenCalledWith({
      applicationId: 2,
      payload: { score: 4, memo: '새 메모' },
    });
  });

  it('삭제 확인 모달에서 삭제를 누르면 delete mutation 이 호출된다', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    // 카드의 삭제 버튼은 확인 모달만 연다(즉시 삭제하지 않는다).
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(mockDelete).not.toHaveBeenCalled();

    // 모달 안의 삭제 버튼을 눌러야 실제로 호출된다.
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it('삭제 확인 모달에서 취소를 누르면 delete mutation 이 호출되지 않는다', async () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  // 히트 영역과 토큰은 jsdom 이 레이아웃을 계산하지 않아 눈으로 볼 수 없다 —
  // BulkActionBar 전례처럼 클래스로 못박는다.
  it('점수 라디오는 44px 히트 영역 라벨로 감싸져 있다', () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={null} />);

    const radio = screen.getByRole('radio', { name: '3' });
    const label = radio.closest('label');
    expect(label).not.toBeNull();
    expect(label).toHaveClass('min-h-11', 'min-w-11');
  });

  it('삭제 버튼은 danger-quiet 토큰을 쓴다', () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    expect(screen.getByRole('button', { name: '삭제' }).className).toContain('btn-danger-quiet');
  });

  // 마감 모집 읽기 전용 (스펙 §1-3 차단 표 · §6)
  it('readOnly 면 평가 수정·삭제 버튼이 사라진다', () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} readOnly />);

    // 수정은 전부 비활성인 폼으로만 이어지는 죽은 어포던스라 삭제와 함께 감춘다.
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    // 조회는 그대로 — 점수와 메모는 계속 보인다.
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('기존 메모')).toBeInTheDocument();
  });

  it('readOnly 면 입력과 저장이 비활성되고 평가 맥락 안내가 뜬다', () => {
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={null} readOnly />);

    expect(screen.getByRole('textbox', { name: '메모' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    // 상태 변경 문구 재사용이 아니라 평가 맥락 문구여야 한다.
    expect(screen.getByText('마감된 모집은 평가를 작성·수정할 수 없습니다')).toBeInTheDocument();
    expect(
      screen.queryByText(/최종 결과만 확정할 수 있습니다/),
    ).not.toBeInTheDocument();
  });

  // lazy-close 프리즈 — 화면이 OPEN 으로 열린 뒤 모집이 마감되면 저장만 409 로 떨어진다.
  // 이때 작성 중이던 입력이 사라지면 안 된다.
  it('저장이 RECRUITMENT_CLOSED 로 실패하면 토스트를 띄우고 입력값을 보존한다', async () => {
    mockUpsert.mockRejectedValue(
      new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'),
    );
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={null} />);

    const textarea = screen.getByRole('textbox', { name: '메모' });
    await userEvent.type(textarea, '작성 중이던 메모');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('마감된 모집에서는 할 수 없는 작업입니다');
    expect(screen.getByRole('textbox', { name: '메모' })).toHaveValue('작성 중이던 메모');
  });

  // 삭제도 같은 창에서 409 로 떨어진다 — 확인 모달은 닫지 않고 그 안에서 마감 사유를 안내한다.
  it('삭제가 RECRUITMENT_CLOSED 로 실패하면 확인 모달 안에 마감 안내가 뜬다', async () => {
    mockDelete.mockRejectedValue(
      new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'),
    );
    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(
      await within(dialog).findByText('마감된 모집에서는 할 수 없는 작업입니다'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
