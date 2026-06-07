import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  SystemComposedSlide,
  type SystemComposedSlideData,
} from '../../../app/_components/sections/banner/SystemComposedSlide';

function makeSlide(overrides: Partial<SystemComposedSlideData> = {}): SystemComposedSlideData {
  return {
    key: 'test',
    tag: 'EVENT',
    title: '테스트 배너 제목',
    sub: '테스트 부제',
    cta: '자세히 보기',
    bg: '#143025',
    fg: '#fff',
    accent: '#9DB6A0',
    emoji: '🎉',
    href: '/clubs',
    bannerImageUrl: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    ...overrides,
  };
}

describe('SystemComposedSlide — main variant', () => {
  it('제목/부제/CTA 가 모두 렌더링된다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide()} />);
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    expect(screen.getByText('테스트 부제')).toBeInTheDocument();
    expect(screen.getByText('자세히 보기')).toBeInTheDocument();
  });

  it('태그가 노출된다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ tag: 'EVENT · 9.25' })} />);
    expect(screen.getByText('EVENT · 9.25')).toBeInTheDocument();
  });

  it('외부 URL 은 target=_blank 인 <a> 로 감싼다', () => {
    render(
      <SystemComposedSlide
        variant="main"
        slide={makeSlide({ href: 'https://example.com/event' })}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('내부 경로는 next/link 로 감싼다 (target 미설정)', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ href: '/clubs' })} />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('href', '/clubs');
  });
});

describe('SystemComposedSlide — preview variant', () => {
  it('button 으로 렌더되고 제목 일부가 표시된다', () => {
    render(
      <SystemComposedSlide
        variant="preview"
        slide={makeSlide()}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
  });
});
