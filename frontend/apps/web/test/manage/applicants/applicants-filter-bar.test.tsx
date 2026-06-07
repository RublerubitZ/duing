import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicantsFilterBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantsFilterBar';

describe('ApplicantsFilterBar', () => {
  it('상태 드롭다운 변경 시 onChange 가 status 와 함께 호출된다', async () => {
    const onChange = vi.fn();
    render(<ApplicantsFilterBar filters={{}} onChange={onChange} useInterview />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '상태' }), 'UNDER_REVIEW');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'UNDER_REVIEW' }),
    );
  });

  it('useInterview=false 면 INTERVIEW_PENDING 옵션이 없다', () => {
    render(
      <ApplicantsFilterBar filters={{}} onChange={() => {}} useInterview={false} />,
    );
    expect(
      screen.queryByRole('option', { name: /면접 대기/ }),
    ).not.toBeInTheDocument();
  });

  it('useInterview=true 면 INTERVIEW_PENDING 옵션이 표시된다', () => {
    render(<ApplicantsFilterBar filters={{}} onChange={() => {}} useInterview />);
    expect(screen.getByRole('option', { name: /면접 대기/ })).toBeInTheDocument();
  });

  it('필터 초기화 버튼은 빈 객체로 onChange 호출', async () => {
    const onChange = vi.fn();
    render(
      <ApplicantsFilterBar
        filters={{ status: 'UNDER_REVIEW' }}
        onChange={onChange}
        useInterview
      />,
    );

    await userEvent.click(screen.getByText('필터 초기화'));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('검색창 입력은 debounce 후 onChange 에 q 값으로 반영된다', async () => {
    const onChange = vi.fn();
    render(<ApplicantsFilterBar filters={{}} onChange={onChange} useInterview />);

    const searchInput = screen.getByLabelText('지원자 검색');
    await userEvent.type(searchInput, '홍길동');

    // debounce 300ms 가 지나도록 실시간 대기
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ q: '홍길동' }),
    );
  }, 10_000);
});
