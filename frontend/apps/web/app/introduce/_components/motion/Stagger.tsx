'use client';

// 스크롤 진입 시 자식 <StaggerItem> 들을 일정 간격(gap, 초)으로 시차 등장시킨다.
// FadeIn 과 동일한 두잉 이징을 쓰되, 컨테이너가 자식들의 등장 타이밍을 지휘한다.
// 접근성: prefers-reduced-motion 이면 whileInView 트리거 대신 animate 로 즉시 'show' 로 올린다.
//   (initial 은 상수 'hidden' 으로 둬 SSR/클라이언트 첫 렌더 마크업을 동일하게 유지 — 하이드레이션 불일치 방지.)

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE_DUING = [0.2, 0.7, 0.2, 1] as const;

type StaggerProps = {
  children: ReactNode;
  className?: string;
  /** 자식 간 등장 간격(초) */
  gap?: number;
};

export function Stagger({ children, className, gap = 0.06 }: StaggerProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate={shouldReduce ? 'show' : undefined}
      whileInView={shouldReduce ? undefined : 'show'}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ show: { transition: { staggerChildren: shouldReduce ? 0 : gap } } }}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = {
  children: ReactNode;
  className?: string;
  /** 떠오르는 거리(px) */
  y?: number;
};

export function StaggerItem({ children, className, y = 18 }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_DUING } },
      }}
    >
      {children}
    </motion.div>
  );
}
