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
  it('이미지가 있으면 draggable=false 가 설정된다 (바탕화면 드래그 다운로드 차단)', () => {
    const { container } = render(
      <SystemComposedSlide variant="main" slide={makeSlide({ bannerImageUrl: 'https://cdn.test/x.jpg' })} />,
    );
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('draggable', 'false');
  });

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

  it('main 의 href 가 null 이면 role=link 가 없고 cursor-default 가 적용된 div 로 렌더된다', () => {
    const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    const wrappingDiv = container.firstChild as HTMLElement;
    expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
    expect(wrappingDiv.className).toContain('cursor-default');
  });

  it('main 의 href 가 null 이면 wrapping 요소가 Tab focus 불가능하다', () => {
    const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
    const wrappingDiv = container.firstChild as HTMLElement;
    expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
    expect(wrappingDiv.tabIndex).toBe(-1);
  });

  it('CTA 라벨이 빈 문자열이면 메인 슬라이드에 버튼이 렌더되지 않는다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ cta: '' })} />);
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
  });

  it('CTA 라벨이 있으면 메인 슬라이드에 버튼이 렌더된다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ cta: '박람회 자세히 보기' })} />);
    expect(screen.getByText('박람회 자세히 보기')).toBeInTheDocument();
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

  it('preview 의 부제 영역은 단순 텍스트만 포함하고 아이콘이 없다', () => {
    render(
      <SystemComposedSlide
        variant="preview"
        slide={makeSlide({ sub: '67개 동아리 · 80개 부스' })}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    const subContainer = screen.getByText('67개 동아리');
    expect(subContainer.querySelector('svg')).toBeNull();
  });
});
