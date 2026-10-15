import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClubPhoto } from '@duing/types';

import {
  PhotoLightbox,
  type LightboxSlide,
} from '@/app/clubs/[clubId]/_components/PhotoLightbox';
import { ClubDetailPhotos } from '@/app/clubs/[clubId]/_components/ClubDetailPhotos';

const makePhotos = (count: number, withCaption = true): ClubPhoto[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    storageKey: `https://cdn.test/photo-${index + 1}.jpg`,
    caption: withCaption ? `사진 ${index + 1}` : null,
    width: 800,
    height: 600,
    displayOrder: index,
  }));

// 활동 사진(제목 없음) 슬라이드 — 라이트박스 직접 테스트용.
const makeSlides = (count: number, withCaption = true): LightboxSlide[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    imageUrl: `https://cdn.test/photo-${index + 1}.jpg`,
    title: null,
    caption: withCaption ? `사진 ${index + 1}` : null,
  }));

const counter = () => screen.getByTestId('lightbox-counter');

describe('PhotoLightbox', () => {
  it('open 이면 initialIndex 슬라이드와 "n / 전체" 카운터를 보여준다', () => {
    render(<PhotoLightbox slides={makeSlides(3)} initialIndex={1} open onClose={vi.fn()} />);
    expect(counter()).toHaveTextContent('2 / 3');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/photo-2.jpg');
  });

  it('open=false 면 카운터·이미지·버튼 모두 렌더하지 않는다', () => {
    render(
      <PhotoLightbox slides={makeSlides(3)} initialIndex={0} open={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('lightbox-counter')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('다음/이전 버튼으로 슬라이드를 전환하고 카운터가 갱신된다', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox slides={makeSlides(3)} initialIndex={0} open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(counter()).toHaveTextContent('2 / 3');

    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(counter()).toHaveTextContent('1 / 3');
  });

  it('마지막 슬라이드에서 다음을 누르면 처음으로 순환한다', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox slides={makeSlides(2)} initialIndex={1} open onClose={vi.fn()} />);
    expect(counter()).toHaveTextContent('2 / 2');

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(counter()).toHaveTextContent('1 / 2');
  });

  it('키보드 좌우 화살표로 슬라이드를 전환한다', () => {
    render(<PhotoLightbox slides={makeSlides(3)} initialIndex={0} open onClose={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toHaveTextContent('2 / 3');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toHaveTextContent('1 / 3');
  });

  it('닫기 버튼을 누르면 onClose 가 호출된다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PhotoLightbox slides={makeSlides(3)} initialIndex={0} open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('슬라이드가 1장이면 좌우 내비게이션 버튼을 숨긴다', () => {
    render(<PhotoLightbox slides={makeSlides(1)} initialIndex={0} open onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
  });

  it('title 이 있는 슬라이드는 굵은 제목과 설명을 함께 보여준다(대표 활동)', () => {
    render(
      <PhotoLightbox
        slides={[{ id: 'h1', imageUrl: 'k.jpg', title: '데모데이', caption: '학기 하이라이트' }]}
        initialIndex={0}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('데모데이')).toBeInTheDocument();
    expect(screen.getByText('학기 하이라이트')).toBeInTheDocument();
  });

  it('title 없는 슬라이드(활동 사진)는 기존처럼 캡션만 보여준다', () => {
    render(<PhotoLightbox slides={makeSlides(1)} initialIndex={0} open onClose={vi.fn()} />);
    expect(screen.getByText('사진 1')).toBeInTheDocument();
  });
});

describe('ClubDetailPhotos', () => {
  it('사진이 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<ClubDetailPhotos photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('타일을 클릭하면 해당 사진으로 라이트박스가 열린다', async () => {
    const user = userEvent.setup();
    render(<ClubDetailPhotos photos={makePhotos(5, false)} />);

    // 처음엔 라이트박스가 닫혀 있다.
    expect(screen.queryByTestId('lightbox-counter')).not.toBeInTheDocument();

    // 세 번째 타일(인덱스 2) 클릭 → 라이트박스가 3번째 사진으로 열린다.
    await user.click(screen.getByRole('button', { name: '활동 사진 3 크게 보기' }));

    expect(counter()).toHaveTextContent('3 / 5');
  });

  it('정확히 8장이면 더 보기 타일 없이 8장 모두 사진 타일로 보여준다', () => {
    render(<ClubDetailPhotos photos={makePhotos(8, false)} />);
    expect(screen.getAllByRole('button', { name: /크게 보기$/ })).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /더 보기$/ })).not.toBeInTheDocument();
  });

  it('+N 타일을 누르면 라이트박스 대신 8장씩 더 펼치고, 다 펼치면 오버레이가 사라진다', async () => {
    const user = userEvent.setup();
    render(<ClubDetailPhotos photos={makePhotos(20, false)} />);
    const tiles = () => screen.getAllByRole('button', { name: /^활동 사진/ });

    // 처음엔 8장, 마지막 타일에 +12. 펼치기 전엔 알릴 것이 없다.
    expect(tiles()).toHaveLength(8);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    const moreTile = screen.getByRole('button', { name: '활동 사진 12장 더 보기' });
    await user.click(moreTile);
    expect(screen.queryByTestId('lightbox-counter')).not.toBeInTheDocument();

    // 16장, 마지막 타일에 +4. 누른 8번째 타일은 같은 자리(포커스 유지)에서 일반 사진 타일로 돌아온다.
    expect(tiles()).toHaveLength(16);
    expect(moreTile).toHaveFocus();
    expect(moreTile).toHaveAccessibleName('활동 사진 8 크게 보기');
    // 이름만 바뀐 타일 대신 늘어난 장수를 스크린리더에 알린다.
    expect(screen.getByRole('status')).toHaveTextContent('활동 사진 전체 20장 중 16장 표시');
    await user.click(screen.getByRole('button', { name: '활동 사진 4장 더 보기' }));

    // 20장 전부, 더 보기 타일 없음.
    expect(tiles()).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /더 보기$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('활동 사진 전체 20장 중 20장 표시');

    // 펼친 사진도 누르면 해당 사진으로 라이트박스가 열린다.
    await user.click(screen.getByRole('button', { name: '활동 사진 18 크게 보기' }));
    expect(counter()).toHaveTextContent('18 / 20');
  });
});
