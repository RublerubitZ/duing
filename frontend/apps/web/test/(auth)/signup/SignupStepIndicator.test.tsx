import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignupStepIndicator } from '@/app/(auth)/signup/_components/SignupStepIndicator';

// 상단 프로그레스 바 세그먼트는 텍스트·role 이 없어 container 구조로 질의한다.
// 루트(div.mb-6) → 첫 자식(바 행) → 자식들(스텝별 세그먼트) 순서로 접근한다.
function renderBarSegments(step: 1 | 2) {
  const { container } = render(<SignupStepIndicator step={step} />);
  const barRow = container.firstElementChild?.firstElementChild;
  return Array.from(barRow?.children ?? []);
}

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

  it('step=1 이면 첫 세그먼트만 채워지고(bg-ink) 둘째는 비활성(bg-line)이다', () => {
    const [firstSegment, secondSegment] = renderBarSegments(1);
    expect(firstSegment).toHaveClass('bg-ink');
    expect(firstSegment).not.toHaveClass('bg-line');
    expect(secondSegment).toHaveClass('bg-line');
    expect(secondSegment).not.toHaveClass('bg-ink');
  });

  it('step=2 이면 두 세그먼트 모두 채워진다(bg-ink)', () => {
    const [firstSegment, secondSegment] = renderBarSegments(2);
    expect(firstSegment).toHaveClass('bg-ink');
    expect(secondSegment).toHaveClass('bg-ink');
    expect(secondSegment).not.toHaveClass('bg-line');
  });
});
