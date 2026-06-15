import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar';

const mockMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useUpdateApplicationStatusMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('StatusActionBar', () => {
  it('UNDER_REVIEW + useInterview=true 면 면접대기와 불합격 버튼이 노출되고 합격 버튼은 없다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="UNDER_REVIEW" useInterview />);
    expect(screen.getByRole('button', { name: /면접 대상/ })).toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
    expect(buttonTexts.every((text) => !text.trim().startsWith('합격'))).toBe(true);
  });

  it('UNDER_REVIEW + useInterview=false 면 합격과 불합격 버튼이 노출된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="UNDER_REVIEW" useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('합격'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
  });

  it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다 (Legacy 회귀 가드)', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.queryByRole('button', { name: '면접 일정 입력' })).not.toBeInTheDocument();
  });

  it('ACCEPTED 상태에서 최종 상태 메시지가 표시된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);
    expect(screen.getByText(/더 이상 변경 가능한 상태가 없습니다/)).toBeInTheDocument();
  });

  it('전이 버튼 클릭 시 updateStatus mutation 이 호출된다', async () => {
    render(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);
    await userEvent.click(screen.getByRole('button', { name: /서류 검토 중으로/ }));
    expect(mockMutate).toHaveBeenCalledWith({ applicationId: 5, payload: { status: 'UNDER_REVIEW' } });
  });
});
