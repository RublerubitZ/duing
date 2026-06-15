'use client';

// shadcn/ui Sheet — 두잉 전용 셋업 (Radix Dialog 를 측면/하단 슬라이드 패널로).
// 모바일 필터·메뉴 드로어용. 스크림 bg-ink/35, 패널 bg-card·shadow-3·border-line, 슬라이드는
// tailwindcss-animate 의 slide-in/out 유틸. 포털은 .duing 스코프 밖이라 토큰 클래스로만 스타일링한다.

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';

import { cn } from '@/app/_lib/cn';
import { X } from '@/components/duing/Icon';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
});

type SheetSide = 'left' | 'right' | 'bottom';

const SIDE_CLASSES: Record<SheetSide, string> = {
  left: 'inset-y-0 left-0 h-full w-[85%] max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  right:
    'inset-y-0 right-0 h-full w-[85%] max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  bottom:
    'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
};

type SheetContentProps = React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  side?: SheetSide;
  /** 내장 X 닫기 버튼 숨김 — 자체 핸들/적용 버튼으로 닫는 바텀시트 등에 사용. */
  hideClose?: boolean;
};

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(function SheetContent({ side = 'left', className, children, hideClose = false, ...props }, ref) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 overflow-y-auto bg-card font-body tracking-body shadow-3 border-line transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-400',
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <SheetPrimitive.Close className="absolute right-3 top-3 rounded-sm p-2 text-charcoal-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <X size={18} />
            <span className="sr-only">닫기</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col space-y-1', className)} {...props} />;
}

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-ink-deep', className)}
      {...props}
    />
  );
});

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cn('text-xs text-charcoal-3', className)}
      {...props}
    />
  );
});

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
