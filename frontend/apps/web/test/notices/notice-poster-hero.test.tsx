import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NoticePosterHero } from '@/app/notices/_components/NoticePosterHero';

describe('NoticePosterHero', () => {
  it('커버가 있으면 확대 버튼을 눌렀을 때 라이트박스가 커버 이미지로 열린다', () => {
    render(
      <NoticePosterHero coverImageUrl="https://cdn.test/cover.jpg" title="공지 제목" summary="요약" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '공지 제목 대표 이미지 크게 보기' }));
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute(
      'src',
      'https://cdn.test/cover.jpg',
    );
  });

  it('커버가 없으면 확대 버튼이 없다', () => {
    render(<NoticePosterHero coverImageUrl="" title="공지 제목" summary="요약" />);
    expect(screen.queryByRole('button', { name: /크게 보기/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });

  it('라이트박스를 연 뒤 닫기 버튼을 누르면 사라진다', () => {
    render(
      <NoticePosterHero coverImageUrl="https://cdn.test/cover.jpg" title="공지 제목" summary="요약" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '공지 제목 대표 이미지 크게 보기' }));
    expect(screen.getByTestId('notice-lightbox-image')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });
});
