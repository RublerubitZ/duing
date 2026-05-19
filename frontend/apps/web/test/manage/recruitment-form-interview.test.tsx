import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

describe('RecruitmentForm — 면접 일정', () => {
  it('면접 진행 체크 시 면접 시작/종료일 입력이 노출된다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    expect(screen.queryByLabelText('면접 시작일')).toBeNull();

    fireEvent.click(screen.getByLabelText(/면접 진행/));
    expect(screen.getByLabelText('면접 시작일')).toBeInTheDocument();
    expect(screen.getByLabelText('면접 종료일')).toBeInTheDocument();
  });

  it('지원자 수 공개 체크박스가 기본 false 이고 토글된다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    const applicantCountCheckbox = screen.getByLabelText(/현재 지원자 수를 학생에게 공개/);
    if (!(applicantCountCheckbox instanceof HTMLInputElement)) {
      throw new Error('지원자 수 공개 체크박스를 찾지 못했습니다.');
    }
    expect(applicantCountCheckbox.checked).toBe(false);
    fireEvent.click(applicantCountCheckbox);
    expect(applicantCountCheckbox.checked).toBe(true);
  });
});
