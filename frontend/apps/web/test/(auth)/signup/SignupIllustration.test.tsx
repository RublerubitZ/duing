import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignupIllustration } from '@/app/_components/SignupIllustration';

describe('SignupIllustration', () => {
  it('안내 일러스트를 접근 가능한 이미지로 렌더한다', () => {
    render(<SignupIllustration />);
    expect(
      screen.getByRole('img', { name: '문자로 코드를 보내 본인 인증하는 방법 안내' }),
    ).toBeInTheDocument();
  });

  it('폰 전체가 보이도록 viewBox 높이를 660 으로 확장한다', () => {
    render(<SignupIllustration />);
    expect(screen.getByRole('img', { name: /본인 인증하는 방법/ })).toHaveAttribute(
      'viewBox',
      '0 0 860 660',
    );
  });

  it('className 을 루트 svg 에 전달한다', () => {
    render(<SignupIllustration className="max-w-[360px]" />);
    expect(screen.getByRole('img', { name: /본인 인증하는 방법/ })).toHaveClass('max-w-[360px]');
  });

  it('code·moNumber 를 주면 예시값 대신 실제 값을 그린다', () => {
    render(<SignupIllustration code="A5D8PN9S" moNumber="1666-3538" />);
    expect(screen.getByText('A5D8PN9S')).toBeInTheDocument();
    expect(screen.queryByText('5WAVK4YZ')).not.toBeInTheDocument();
  });
});
