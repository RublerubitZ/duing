import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignupStepProfile } from '@/app/(auth)/signup/_components/SignupStepProfile';
import { initialSignupState } from '@/app/(auth)/signup/_lib/signup-state';

const baseState = { ...initialSignupState, phone: '010-1234-5678' };

describe('SignupStepProfile', () => {
  it('인증 완료 배지에 인증된 번호를 보여준다', () => {
    render(
      <SignupStepProfile
        state={baseState}
        setField={vi.fn()}
        passwordMismatch={false}
        studentIdMismatch={false}
        canSubmit={false}
        isSubmitting={false}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.getByText(/휴대폰 인증 완료/)).toBeInTheDocument();
  });

  it('이전 버튼 클릭 시 onBack 을 호출한다', async () => {
    const onBack = vi.fn();
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={onBack}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /이전/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('canSubmit=false 면 가입 버튼(type=submit)이 비활성이다', () => {
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={vi.fn()}
      />,
    );
    const submitButton = screen.getByRole('button', { name: /가입하고 두잉 시작하기/ });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('이름·학번·학년·학과 필수 필드를 렌더한다', () => {
    render(
      <SignupStepProfile
        state={baseState} setField={vi.fn()} passwordMismatch={false}
        studentIdMismatch={false} canSubmit={false} isSubmitting={false} onBack={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
    expect(screen.getByLabelText('학번')).toBeInTheDocument();
    expect(screen.getByLabelText('학년')).toBeInTheDocument();
    // 학과(major) 입력은 전용 label 이 없어 placeholder 로 검증한다.
    expect(screen.getByPlaceholderText(/학과명/)).toBeInTheDocument();
  });
});
