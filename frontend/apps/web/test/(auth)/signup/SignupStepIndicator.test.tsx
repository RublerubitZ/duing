import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignupStepIndicator } from '@/app/(auth)/signup/_components/SignupStepIndicator';

describe('SignupStepIndicator', () => {
  it('두 스텝 라벨을 항상 보여준다', () => {
    render(<SignupStepIndicator step={1} />);
    expect(screen.getByText('① 휴대폰 인증')).toBeInTheDocument();
    expect(screen.getByText('② 기본 정보')).toBeInTheDocument();
  });

  it('step=1 이면 첫 라벨만 활성(text-ink) 강조된다', () => {
    render(<SignupStepIndicator step={1} />);
    expect(screen.getByText('① 휴대폰 인증')).toHaveClass('text-ink');
    expect(screen.getByText('② 기본 정보')).not.toHaveClass('text-ink');
  });

  it('step=2 이면 두 라벨 모두 활성 강조된다', () => {
    render(<SignupStepIndicator step={2} />);
    expect(screen.getByText('① 휴대폰 인증')).toHaveClass('text-ink');
    expect(screen.getByText('② 기본 정보')).toHaveClass('text-ink');
  });
});
