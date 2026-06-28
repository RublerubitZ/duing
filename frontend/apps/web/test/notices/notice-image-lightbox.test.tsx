import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NoticeImageLightbox } from '@/app/notices/_components/NoticeImageLightbox';

describe('NoticeImageLightbox', () => {
  it('image 가 있으면 해당 src 이미지와 닫기 버튼을 렌더한다', () => {
    render(
      <NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/a.jpg');
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('image=null 이면 이미지·닫기 버튼을 렌더하지 않는다', () => {
    render(<NoticeImageLightbox image={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('닫기 버튼을 누르면 onClose 가 호출된다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('이미지에서 시작한 클릭은 onClose 를 부르지 않는다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={onClose} />);
    const image = screen.getByTestId('notice-lightbox-image');
    fireEvent.pointerDown(image);
    fireEvent.click(image);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('배경(이미지 영역 여백)에서 시작한 클릭은 onClose 를 부른다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={onClose} />);
    const backdrop = screen.getByTestId('notice-lightbox-backdrop');
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
