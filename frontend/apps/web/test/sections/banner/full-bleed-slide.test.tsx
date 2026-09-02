import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// next/image 는 src 를 /_next/image?url=… 로 재작성하므로 원본 URL·속성 단언이 그대로 통하도록
// prop 을 흘려보내는 목을 쓴다. fill·priority·sizes 는 DOM 속성이 아니라 여기서 걷어낸다.
vi.mock('next/image', () => ({
  default: ({
    fill,
    priority,
    sizes,
    ...imageProps
  }: React.ComponentProps<'img'> & { fill?: boolean; priority?: boolean }) => (
    <img {...imageProps} />
  ),
}));

import {
  FullBleedSlide,
  type FullBleedSlideData,
} from '../../../app/_components/sections/banner/FullBleedSlide';

function makeSlide(overrides: Partial<FullBleedSlideData> = {}): FullBleedSlideData {
  return {
    key: 'test',
    href: '/clubs',
    bannerImageUrl: 'https://example.com/poster.png',
    imageAltText: '2026 해커톤 포스터',
    ...overrides,
  };
}

describe('FullBleedSlide', () => {
  it('이미지에 draggable=false 가 설정된다 (바탕화면 드래그 다운로드 차단)', () => {
    render(<FullBleedSlide slide={makeSlide()} />);
    expect(screen.getByAltText('2026 해커톤 포스터')).toHaveAttribute('draggable', 'false');
  });

  it('이미지가 alt 와 함께 렌더링된다', () => {
    render(<FullBleedSlide slide={makeSlide()} />);
    const img = screen.getByAltText('2026 해커톤 포스터');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/poster.png');
  });

  it('alt 가 null 이면 빈 문자열로 fallback', () => {
    render(<FullBleedSlide slide={makeSlide({ imageAltText: null })} />);
    // alt="" 인 이미지는 ARIA role 이 presentation 으로 취급된다.
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('alt', '');
  });

  it('이미지가 없으면 fallback 메시지를 보여준다', () => {
    render(<FullBleedSlide slide={makeSlide({ bannerImageUrl: null })} />);
    expect(screen.getByText('배너 이미지가 없습니다')).toBeInTheDocument();
  });

  it('외부 URL 은 target=_blank 인 <a> 로 감싼다', () => {
    render(
      <FullBleedSlide
        slide={makeSlide({ href: 'https://example.com/event' })}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('SYSTEM_COMPOSED 데코 (제목/CTA/이모지) 가 절대 렌더링되지 않는다', () => {
    render(
      <FullBleedSlide
        slide={makeSlide()}
      />,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
  });

  it('main 의 href 가 null 이면 role=link 가 없는 div 로 이미지만 렌더된다', () => {
    const { container } = render(<FullBleedSlide slide={makeSlide({ href: null })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByAltText('2026 해커톤 포스터')).toBeInTheDocument();
    const wrappingDiv = container.firstChild as HTMLElement;
    expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
    expect(wrappingDiv.className).toContain('cursor-default');
    expect(wrappingDiv.tabIndex).toBe(-1);
  });
});
