import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { Categories } from '../../app/_components/sections/Categories';

describe('Categories', () => {
  it('8개 카테고리 라벨이 모두 렌더된다', () => {
    render(<Categories />);

    for (const label of ['학술', '문화', '예술', '운동', '봉사', '종교', '취미', '기타']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('각 카테고리 링크가 enum 값을 URL 쿼리로 사용한다', () => {
    const { container } = render(<Categories />);

    const expectedHrefs = [
      '/clubs?category=ACADEMIC',
      '/clubs?category=CULTURE',
      '/clubs?category=ART',
      '/clubs?category=SPORTS',
      '/clubs?category=VOLUNTEER',
      '/clubs?category=RELIGION',
      '/clubs?category=HOBBY',
      '/clubs?category=OTHER',
    ];
    for (const href of expectedHrefs) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});
