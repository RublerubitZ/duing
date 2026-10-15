import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoLightbox } from '@/app/clubs/[clubId]/_components/PhotoLightbox';
import { NoticeImageLightbox } from '@/app/notices/_components/NoticeImageLightbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

// 동작 줄이기 가드. 열림·닫힘 애니메이션(data-[state=open]:animate-in 등)은 속성 선택자가 붙어 특이성이 (0,2,0)이라
// motion-reduce:animate-none(0,1,0)만으로는 지지 않는다 — `!` 가 빠지면 가드가 있어 보여도 동작하지 않으므로 글자 그대로 고정한다.
const REDUCED_MOTION_GUARD = 'motion-reduce:!animate-none';

// Radix 스크림(Overlay)은 role 이 없다 — 포털이 Overlay·Content 를 body 에 차례로 붙이므로 패널(role=dialog) 바로 앞 형제다.
function overlayBefore(panel: HTMLElement): HTMLElement {
  const overlay = panel.previousElementSibling;
  if (!(overlay instanceof HTMLElement) || overlay.getAttribute('data-state') !== 'open') {
    throw new Error('열린 스크림이 패널 바로 앞에 없다');
  }
  return overlay;
}

describe('오버레이 동작 줄이기 가드', () => {
  it('Dialog 는 스크림·패널 모두 열림 애니메이션과 가드를 함께 가진다', () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>제목</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
    expect(overlayBefore(panel)).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
  });

  it('Sheet 는 스크림·패널 모두 가드를 가진다', () => {
    render(
      <Sheet open onOpenChange={() => undefined}>
        <SheetContent side="left">
          <SheetTitle>필터</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
    expect(overlayBefore(panel)).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
  });

  it('DropdownMenu 콘텐츠는 가드를 가진다', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>열기</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>항목</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByRole('menu')).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
  });

  it('Popover 콘텐츠는 가드를 가진다', () => {
    render(
      <Popover open>
        <PopoverTrigger>열기</PopoverTrigger>
        <PopoverContent>내용</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
  });

  it('동아리 사진 라이트박스 스크림은 가드를 가진다(이미지 전환은 framer-motion 의 useReducedMotion 이 따로 끈다)', () => {
    render(
      <PhotoLightbox
        slides={[{ id: 1, imageUrl: 'https://cdn.test/photo-1.jpg', title: null, caption: null }]}
        initialIndex={0}
        open
        onClose={vi.fn()}
      />,
    );
    expect(overlayBefore(screen.getByRole('dialog'))).toHaveClass(
      'data-[state=open]:animate-in',
      REDUCED_MOTION_GUARD,
    );
  });

  it('소식 이미지 라이트박스는 스크림·콘텐츠 모두 가드를 가진다', () => {
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/notice-1.jpg', alt: '' }} onClose={vi.fn()} />);
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
    expect(overlayBefore(panel)).toHaveClass('data-[state=open]:animate-in', REDUCED_MOTION_GUARD);
  });
});
