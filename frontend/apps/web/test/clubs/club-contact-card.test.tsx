import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ClubContactCard } from '@/app/clubs/[clubId]/_components/ClubContactCard';

describe('ClubContactCard — 연락처 표시', () => {
  it('http(s) 연락처는 새 탭 외부 링크로 렌더한다', () => {
    const url = 'https://open.kakao.com/o/abc123';
    render(<ClubContactCard snsLinks={[]} location={null} contactEmail={url} />);

    const link = screen.getByRole('link', { name: url });
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('전화번호 등 일반 연락처는 링크 없이 텍스트로 렌더한다', () => {
    render(<ClubContactCard snsLinks={[]} location={null} contactEmail="010-0000-0000" />);

    expect(screen.getByText('010-0000-0000')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('이메일 값이어도 mailto 링크를 만들지 않는다', () => {
    const { container } = render(
      <ClubContactCard snsLinks={[]} location={null} contactEmail="club@daegu.ac.kr" />,
    );

    expect(screen.getByText('club@daegu.ac.kr')).toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('javascript:·data:·프로토콜 상대경로 등 위험 값은 링크를 만들지 않고 텍스트로 렌더한다', () => {
    const dangerousValues = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.com',
    ];

    for (const value of dangerousValues) {
      const { container, unmount } = render(
        <ClubContactCard snsLinks={[]} location={null} contactEmail={value} />,
      );

      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByText(value)).toBeInTheDocument();
      unmount();
    }
  });
});
