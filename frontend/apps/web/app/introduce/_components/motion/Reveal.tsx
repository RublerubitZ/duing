'use client';

// 방향성 스크롤 등장 — FadeIn(세로 페이드업)을 확장해 좌우 슬라이드·스케일 등장까지 다룬다.
// Features 좌우 교차 슬라이드, CTA 강조 등장, 시그니처 섹션의 요소 등장에 쓴다.
// 접근성: prefers-reduced-motion 이면 whileInView 대신 animate 로 마운트 즉시 노출한다.
//   initial 은 reduced 여부와 무관하게 상수로 둬 SSR/클라이언트 첫 렌더 마크업을 동일하게 유지(하이드레이션 불일치 방지).

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EASE_DUING } from '@/components/motion/constants';

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** 가로 시작 오프셋(px) — 양수면 오른쪽에서, 음수면 왼쪽에서 */
  x?: number;
  /** 세로 시작 오프셋(px) */
  y?: number;
  /** 시작 스케일 (1 이면 스케일 없음) */
  scale?: number;
  /** 등장 지연(초) */
  delay?: number;
  /** 등장 시간(초) */
  duration?: number;
};

export function Reveal({
  children,
  className,
  x = 0,
  y = 24,
  scale = 1,
  delay = 0,
  duration = 0.6,
}: RevealProps) {
  const shouldReduce = useReducedMotion();
  const shown = { opacity: 1, x: 0, y: 0, scale: 1 };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y, scale }}
      animate={shouldReduce ? shown : undefined}
      whileInView={shouldReduce ? undefined : shown}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={shouldReduce ? { duration: 0 } : { duration, delay, ease: EASE_DUING }}
    >
      {children}
    </motion.div>
  );
}
