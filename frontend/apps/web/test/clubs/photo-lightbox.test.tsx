import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClubPhoto } from '@duing/types';

import { PhotoLightbox } from '@/app/clubs/[clubId]/_components/PhotoLightbox';
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

const counter = () => screen.getByTestId('lightbox-counter');

describe('PhotoLightbox', () => {
  it('open 이면 initialIndex 사진과 "n / 전체" 카운터를 보여준다', () => {
    render(<PhotoLightbox photos={makePhotos(3)} initialIndex={1} open onClose={vi.fn()} />);
    expect(counter()).toHaveTextContent('2 / 3');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/photo-2.jpg');
  });

  it('open=false 면 카운터·이미지·버튼 모두 렌더하지 않는다', () => {
    render(
      <PhotoLightbox photos={makePhotos(3)} initialIndex={0} open={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('lightbox-counter')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('다음/이전 버튼으로 사진을 전환하고 카운터가 갱신된다', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={makePhotos(3)} initialIndex={0} open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(counter()).toHaveTextContent('2 / 3');

    await user.click(screen.getByRole('button', { name: '이전 사진' }));
    expect(counter()).toHaveTextContent('1 / 3');
  });

  it('마지막 사진에서 다음을 누르면 처음으로 순환한다', async () => {
    const user = userEvent.setup();
    render(<PhotoLightbox photos={makePhotos(2)} initialIndex={1} open onClose={vi.fn()} />);
    expect(counter()).toHaveTextContent('2 / 2');

    await user.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(counter()).toHaveTextContent('1 / 2');
  });

  it('키보드 좌우 화살표로 사진을 전환한다', () => {
    render(<PhotoLightbox photos={makePhotos(3)} initialIndex={0} open onClose={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toHaveTextContent('2 / 3');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toHaveTextContent('1 / 3');
  });

  it('닫기 버튼을 누르면 onClose 가 호출된다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PhotoLightbox photos={makePhotos(3)} initialIndex={0} open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('사진이 1장이면 좌우 내비게이션 버튼을 숨긴다', () => {
    render(<PhotoLightbox photos={makePhotos(1)} initialIndex={0} open onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '다음 사진' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전 사진' })).not.toBeInTheDocument();
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

  it('8장 초과 시 +N 타일을 눌러 열면 보이지 않던 사진까지 넘겨 볼 수 있다', async () => {
    const user = userEvent.setup();
    render(<ClubDetailPhotos photos={makePhotos(10, false)} />);

    // 그리드는 8장만 노출하고 마지막 타일에 +2 오버레이를 둔다.
    await user.click(screen.getByRole('button', { name: '활동 사진 8 외 2장 더 보기' }));
    expect(counter()).toHaveTextContent('8 / 10');

    // 라이트박스 안에서는 그리드에 없던 9·10번째 사진도 순회할 수 있다.
    await user.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(counter()).toHaveTextContent('9 / 10');
  });
});
