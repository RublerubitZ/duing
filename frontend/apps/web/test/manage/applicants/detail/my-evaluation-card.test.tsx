import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyEvaluationCard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/MyEvaluationCard';
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
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
    expect(screen.getByPlaceholderText(/강점, 약점/)).toBeInTheDocument();
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
    expect(screen.queryByPlaceholderText(/강점, 약점/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByPlaceholderText(/강점, 약점/)).toBeInTheDocument();
  });

  it('수정 모드에서 저장하면 현재 score 와 memo 로 upsert mutation 을 호출한다', async () => {
    wrap(<MyEvaluationCard applicationId={2} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    const textarea = screen.getByPlaceholderText(/강점, 약점/);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '새 메모');

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpsert).toHaveBeenCalledWith({
      applicationId: 2,
      payload: { score: 4, memo: '새 메모' },
    });
  });

  it('삭제 confirm 통과 시 delete mutation 이 호출된다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it('삭제 confirm 취소 시 delete mutation 이 호출되지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    wrap(<MyEvaluationCard applicationId={1} myEvaluation={existingEvaluation} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
