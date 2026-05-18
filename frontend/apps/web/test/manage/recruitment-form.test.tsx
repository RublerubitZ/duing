import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

describe('RecruitmentForm — 상시모집 토글', () => {
  it('상시모집 체크박스를 켜면 종료일 입력이 disabled 되고 값이 비워진다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    const endDateInput = screen.getByLabelText(/^종료일/) as HTMLInputElement;
    const alwaysOpenCheckbox = screen.getByLabelText(/^상시모집/);

    fireEvent.change(endDateInput, { target: { value: '2026-12-31' } });
    expect(endDateInput.value).toBe('2026-12-31');

    fireEvent.click(alwaysOpenCheckbox);
    expect(endDateInput).toBeDisabled();
    expect(endDateInput.value).toBe('');
  });

  it('상시모집 체크 + 외부폼 으로 채워 제출하면 endDate=null 로 onSubmit 이 호출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
      target: { value: '상시모집 공고' },
    });
    fireEvent.change(screen.getByLabelText(/시작일/), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });

    fireEvent.click(screen.getByLabelText(/^상시모집/));

    // 자체폼 기본 + 질문 1개 추가가 어렵다면 EXTERNAL 로 전환
    fireEvent.click(screen.getByLabelText('외부 폼'));
    fireEvent.change(screen.getByPlaceholderText('https://forms.google.com/...'), {
      target: { value: 'https://forms.example.com/x' },
    });

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ endDate: null });
  });
});
