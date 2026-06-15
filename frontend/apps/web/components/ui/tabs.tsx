'use client';

// shadcn/ui Tabs — 두잉 전용 셋업 (Radix on 두잉 토큰).
// 두잉 보정: 언더라인 탭 스타일 — TabsList 는 border-line 하단선, TabsTrigger 는 활성 시 border-ink/text-ink,
// 비활성은 text-charcoal-3 hover:text-charcoal. 라벨은 font-body(Pretendard) — UI 텍스트라 GmarketSans 아님.
// 활성 보더(2.5px)가 리스트 하단선(1px) 위에 겹치도록 트리거에 -mb-px 를 둔다.
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
      className={cn('flex gap-8 border-b border-line', className)}
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
        '-mb-[1.5px] border-b-[2.5px] border-transparent px-0 py-3.5 text-[15px] font-semibold text-charcoal-3 transition-colors',
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
