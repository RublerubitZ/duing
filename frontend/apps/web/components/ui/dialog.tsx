'use client';

// shadcn/ui Dialog — 두잉 전용 셋업 (Radix on 두잉 토큰).
// 두잉 보정: 스크림 bg-ink/35(잉크틴트), 패널 bg-card(paper)/border-line/shadow-3(잉크틴트)/rounded-lg(20px),
// 타이틀 font-body(Pretendard, UI 텍스트는 GmarketSans 아님 — DESIGN line 47). 빌트인 X 닫기 버튼은 두지 않는다
// (호출처가 비동기 제어 패턴이면 명시 버튼/ESC 로 닫는다). 포털은 .duing 스코프 밖이라 토큰 클래스로만 스타일링한다.

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { useBackDismiss } from '@/app/_lib/backDismiss';
import { cn } from '@/app/_lib/cn';

// 열려 있는 동안 뒤로가기(안드로이드 버튼·제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를 흡수해
// 페이지 이동 대신 이 다이얼로그만 닫는다. 호출처는 기존과 동일한 props 를 쓴다.
function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  useBackDismiss(open === true, onOpenChange ? () => onOpenChange(false) : null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
});

/**
 * `busy` 는 "요청이 나갔고 아직 안 끝났다"를 뜻한다 — true 면 ESC·바깥 클릭 닫기를 막는다.
 *
 * <p>취소 버튼만 `disabled={isPending}` 로 막고 ESC·바깥 클릭은 열어두면 같은 모달에서
 * 버튼으로는 못 닫는데 키보드로는 닫힌다. 사용자는 "취소됐다"고 이해하지만 요청은 그대로 진행돼,
 * 회원 탈퇴처럼 되돌릴 수 없는 작업에서는 모달이 사라진 뒤 결과만 뒤늦게 나타난다.
 *
 * <p>뒤로가기 닫기(`useBackDismiss`)는 여기서 막지 않는다 — 호출처의 `onOpenChange` 게이트가
 * 담당하는 경로라 두 곳에서 같은 판정을 하면 어긋난다.
 *
 * <p>미전달 시 동작은 이전과 완전히 같다. 잠금이 안 풀리는 상황은 구조적으로 없다 —
 * API 클라이언트가 분류별 타임아웃을 걸고 오프라인은 즉시 실패하므로 pending 은 반드시 풀린다.
 */
type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  busy?: boolean;
};

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, busy, onEscapeKeyDown, onPointerDownOutside, ...props },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-card p-6 font-body tracking-body shadow-3',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex justify-end gap-2 pt-2', className)} {...props} />;
}

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('font-body text-base font-semibold text-ink-deep', className)}
      {...props}
    />
  );
});

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-xs text-charcoal-3', className)}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
