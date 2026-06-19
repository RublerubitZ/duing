'use client';

// Hero 비주얼에 스크롤 연동 패럴랙스를 입힌다 — 페이지를 내릴수록 살짝 위로 떠오르며 미세하게 확대.
// 애플식의 "과하지 않은" 깊이감만 의도하므로 이동·스케일 폭을 작게 잡는다.
// 접근성: prefers-reduced-motion 이면 정적으로 둔다(transform 미적용).

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import type { ReactNode } from 'react';

type HeroParallaxProps = {
  children: ReactNode;
  className?: string;
};

export function HeroParallax({ children, className }: HeroParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.04]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={shouldReduce ? undefined : { y, scale }}>{children}</motion.div>
    </div>
  );
}
