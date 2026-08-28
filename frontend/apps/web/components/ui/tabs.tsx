'use client';

// shadcn/ui Tabs — 두잉 전용 셋업 (Radix on 두잉 토큰).
// 두잉 보정: 언더라인 탭 스타일 — TabsTrigger 는 활성 시 border-ink/text-ink,
// 비활성은 text-charcoal-3 hover:text-charcoal. 라벨은 본문 서체(Pretendard) 그대로.
// 레일 받침선은 두지 않는다(섹션 구분선 금지) — 활성 표시는 트리거의 2.5px 보더 단독.
// Radix 가 roving tabindex·화살표 키 네비·ARIA(tablist/tab/tabpanel)를 제공한다.

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/app/_lib/cn';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('flex gap-8', className)}
      {...props}
    />
  );
});

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'border-b-[2.5px] border-transparent px-0 py-3.5 text-[15px] font-semibold text-charcoal-3 transition-colors',
        'hover:text-charcoal focus-visible:text-ink focus-visible:outline-none',
        'data-[state=active]:border-ink data-[state=active]:text-ink',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('focus-visible:outline-none', className)}
      {...props}
    />
  );
});

export { Tabs, TabsList, TabsTrigger, TabsContent };
