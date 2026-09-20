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

describe('SystemComposedSlide', () => {
  it('이미지가 있으면 draggable=false 가 설정된다 (바탕화면 드래그 다운로드 차단)', () => {
    const { container } = render(
      <SystemComposedSlide slide={makeSlide({ bannerImageUrl: 'https://cdn.test/x.jpg' })} />,
    );
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('draggable', 'false');
  });

  it('제목/부제/CTA 가 모두 렌더링된다', () => {
    render(<SystemComposedSlide slide={makeSlide()} />);
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    expect(screen.getByText('테스트 부제')).toBeInTheDocument();
    expect(screen.getByText('자세히 보기')).toBeInTheDocument();
  });

  it('태그가 노출된다', () => {
    render(<SystemComposedSlide slide={makeSlide({ tag: 'EVENT · 9.25' })} />);
    expect(screen.getByText('EVENT · 9.25')).toBeInTheDocument();
  });

  it('외부 URL 은 target=_blank 인 <a> 로 감싼다', () => {
    render(
      <SystemComposedSlide
        slide={makeSlide({ href: 'https://example.com/event' })}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('내부 경로는 next/link 로 감싼다 (target 미설정)', () => {
    render(<SystemComposedSlide slide={makeSlide({ href: '/clubs' })} />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('href', '/clubs');
  });

  it('main 의 href 가 null 이면 role=link 가 없고 cursor-default 가 적용된 div 로 렌더된다', () => {
    const { container } = render(<SystemComposedSlide slide={makeSlide({ href: null })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    const wrappingDiv = container.firstChild as HTMLElement;
    expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
    expect(wrappingDiv.className).toContain('cursor-default');
  });

  it('main 의 href 가 null 이면 wrapping 요소가 Tab focus 불가능하다', () => {
    const { container } = render(<SystemComposedSlide slide={makeSlide({ href: null })} />);
    const wrappingDiv = container.firstChild as HTMLElement;
    expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
    expect(wrappingDiv.tabIndex).toBe(-1);
  });

  it('CTA 라벨이 빈 문자열이면 메인 슬라이드에 버튼이 렌더되지 않는다', () => {
    render(<SystemComposedSlide slide={makeSlide({ cta: '' })} />);
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
  });

  it('CTA 라벨이 있으면 메인 슬라이드에 버튼이 렌더된다', () => {
    render(<SystemComposedSlide slide={makeSlide({ cta: '박람회 자세히 보기' })} />);
    expect(screen.getByText('박람회 자세히 보기')).toBeInTheDocument();
  });
});

/**
 * 배너는 비율 고정(모바일 2.9:1, md 부터 4.3:1)이라 높이가 곧 예산이다(md 띠 160px 에 여유 7px). 문구의 줄 수 상한
 * 하나만 풀려도 콘텐츠가 위치 표시·화살표를 침범한다(실제로 두 번 그렇게 깨졌다).
 * 클래스 문자열을 통째로 단언하면 스타일 변경마다 깨지므로, 상한을 만드는 구조만 고정한다.
 */
describe('SystemComposedSlide — 고정 비율 띠를 지키는 줄 수 상한', () => {
  it('제목은 한 줄에서 잘린다', () => {
    render(<SystemComposedSlide slide={makeSlide({ title: '아주 긴 제목' })} />);
    const heading = screen.getByRole('heading');
    expect(heading).toHaveClass('line-clamp-1');
    // 반응형 변형으로 상한을 다시 풀면(sm:line-clamp-none·md:line-clamp-2 등) toHaveClass 만으로는 못 잡는다.
    expect(heading.className).not.toMatch(/:line-clamp-/);
  });

  it('부제는 lg 부터, CTA 는 md 부터만 보인다 — 좁은 띠에는 자리가 없다', () => {
    render(<SystemComposedSlide slide={makeSlide({ sub: '부제', cta: '자세히' })} />);
    expect(screen.getByText('부제').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.getByText('자세히').closest('.btn')).toHaveClass('hidden', 'md:inline-flex');
  });

  it('부제는 한 줄에서 잘린다 — 노출 래퍼와 분리돼 있어야 line-clamp 가 살아 있다', () => {
    render(<SystemComposedSlide slide={makeSlide({ sub: '아주 긴 부제' })} />);
    const sub = screen.getByText('아주 긴 부제');
    expect(sub).toHaveClass('line-clamp-1');
    // display 유틸리티를 같은 요소에 얹으면 -webkit-box 를 덮어 상한이 조용히 풀린다.
    expect(sub.className).not.toMatch(/\b(hidden|block)\b/);
  });

  it('태그와 CTA 는 말줄임 스팬 안에 담긴다 — 인라인으로 되돌리면 줄바꿈이 살아난다', () => {
    render(<SystemComposedSlide slide={makeSlide({ tag: '아주 긴 태그', cta: '아주 긴 CTA' })} />);
    expect(screen.getByText('아주 긴 태그')).toHaveClass('truncate');
    expect(screen.getByText('아주 긴 CTA')).toHaveClass('truncate');
  });
});
