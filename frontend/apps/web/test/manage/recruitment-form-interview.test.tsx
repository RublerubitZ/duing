import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

describe('RecruitmentForm — 면접 일정', () => {
  it('면접 진행 스위치를 켜면 면접 시작/종료일 입력이 노출된다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    expect(screen.queryByLabelText('면접 시작일')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: '면접 진행' }));
    expect(screen.getByLabelText('면접 시작일')).toBeInTheDocument();
    expect(screen.getByLabelText('면접 종료일')).toBeInTheDocument();
  });

  it('지원자 수 공개 스위치가 기본 false 이고 토글된다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    const applicantCountSwitch = screen.getByRole('switch', { name: '지원자 수 공개' });
    expect(applicantCountSwitch).not.toBeChecked();
    fireEvent.click(applicantCountSwitch);
    expect(applicantCountSwitch).toBeChecked();
  });
});
