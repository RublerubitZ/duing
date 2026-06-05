import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageWithFallback } from '../../app/_components/ImageWithFallback';

describe('ImageWithFallback', () => {
  it('src 가 null 이면 emptyMessage 를 표시한다', () => {
    render(<ImageWithFallback src={null} alt="표지" emptyMessage="대표 이미지 없음" />);
    expect(screen.getByText('대표 이미지 없음')).toBeInTheDocument();
    expect(screen.queryByAltText('표지')).toBeNull();
  });

  it('src 가 빈 문자열이면 emptyMessage 를 표시한다', () => {
    render(<ImageWithFallback src="" alt="표지" />);
    expect(screen.getByText('대표 이미지 없음')).toBeInTheDocument();
  });

  it('src 가 있으면 img 를 렌더한다', () => {
    render(<ImageWithFallback src="https://example.com/a.jpg" alt="표지" />);
    const img = screen.getByAltText('표지');
    expect(img).toHaveAttribute('src', 'https://example.com/a.jpg');
  });

  it('img 의 onError 가 발생하면 errorMessage 로 교체된다', () => {
    render(<ImageWithFallback src="https://example.com/broken.jpg" alt="표지" />);
    const img = screen.getByAltText('표지');
    fireEvent.error(img);
    expect(screen.getByText('이미지를 불러올 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByAltText('표지')).toBeNull();
  });
});
