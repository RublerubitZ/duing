'use client';

// shadcn/ui Sheet — 두잉 전용 셋업 (Radix Dialog 를 측면/하단 슬라이드 패널로).
// 모바일 필터·메뉴 드로어용. 스크림 bg-ink/35, 패널 bg-card·shadow-3·border-line, 슬라이드는
// tailwindcss-animate 의 slide-in/out 유틸. 포털은 .duing 스코프 밖이라 토큰 클래스로만 스타일링한다.

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';

import { useBackDismiss } from '@/app/_lib/backDismiss';
import { startedOnClosingLayer } from '@/app/_lib/closingLayerTap';
import { cn } from '@/app/_lib/cn';
import { useSwipeDismiss } from '@/app/_lib/useSwipeDismiss';
import { X } from '@/components/duing/Icon';

// 열림 상태와 닫기 콜백을 루트 Sheet 에서 SheetContent 로 내린다 — 아래로 스와이프해 닫기가 쓴다.
// Radix 는 Content 에 open·onOpenChange 를 노출하지 않고, 호출부는 건드리지 않는 게 요구사항이라
// 컨텍스트로 전달한다. dismiss 가 null(닫기 콜백 없는 시트) 이면 스와이프 닫기는 비활성.
// open 까지 내리는 이유: SheetContent 는 시트가 닫혀 있어도 계속 마운트돼 있어서(DOM 만 Radix
// Presence 가 붙였다 뗀다), 열림 여부를 안 보면 닫힌 페이지에도 document 리스너가 남는다.
type SheetDismissContextValue = { open: boolean; dismiss: (() => void) | null };

const SheetDismissContext = React.createContext<SheetDismissContextValue>({
  open: false,
  dismiss: null,
});

// 열려 있는 동안 뒤로가기(안드로이드 버튼·제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를 흡수해
// 페이지 이동 대신 이 시트만 닫는다. 호출처는 기존과 동일한 props 를 쓴다.
function Sheet({
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root>) {
  useBackDismiss(open === true, onOpenChange ? () => onOpenChange(false) : null);
  const dismissValue = React.useMemo(
    () => ({ open: open === true, dismiss: onOpenChange ? () => onOpenChange(false) : null }),
    [open, onOpenChange],
  );
  return (
    <SheetDismissContext.Provider value={dismissValue}>
      <SheetPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />
    </SheetDismissContext.Provider>
  );
}
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
        'fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:!animate-none',
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
  /**
   * "요청이 나갔고 아직 안 끝났다" — true 면 ESC·바깥 탭·아래로 스와이프 닫기를 막는다(DialogContent busy #912 와 같은 의미).
   * 스와이프는 끌어내린 위치를 남긴 채 닫기 콜백을 부르므로 콜백에서 거부하면 패널이 어긋난 채 남는다 — 그래서 제스처를 끈다.
   * 뒤로가기 닫기는 여기서 막지 않는다 — 호출처 onOpenChange 가 busy 중 false 를 무시한다(엔트리는 유지된다).
   * 닫히는 다이얼로그에서 시작한 탭(겹친 수정 창의 "취소" 등)은 바깥 탭으로 받지 않는다 — closingLayerTap 주석 참조.
   */
  busy?: boolean;
};

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(function SheetContent(
  { side = 'left', className, children, hideClose = false, busy, onEscapeKeyDown, onPointerDownOutside, ...props },
  ref,
) {
  const { open, dismiss } = React.useContext(SheetDismissContext);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  // forwardRef 로 받은 ref 와 훅이 쓸 로컬 ref 를 합친다(둘 다 채워야 한다).
  const composeContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref !== null) ref.current = node;
    },
    [ref],
  );
  useSwipeDismiss(contentRef, {
    enabled: side === 'bottom' && open && dismiss !== null && busy !== true,
    onDismiss: dismiss ?? (() => undefined),
  });

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={composeContentRef}
        // 전송 중임을 영역 상태로 표기한다 — 넘기지 않은 시트에는 속성을 붙이지 않는다(기존 시트 무변화).
        aria-busy={busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (busy || startedOnClosingLayer(event.detail.originalEvent.target))
            event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'fixed z-50 overflow-y-auto bg-card font-body tracking-body shadow-3 border-line transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-400 motion-reduce:!animate-none',
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
