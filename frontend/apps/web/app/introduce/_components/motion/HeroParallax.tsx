'use client';

// 스크롤 연동 패럴랙스 레이어 — 페이지를 내릴수록 요소가 스크롤 진행도에 따라 이동/확대된다.
// 레이어마다 이동·스케일 폭을 달리 줘 깊이감을 만든다(비주얼은 크게, 텍스트·배경은 은은하게).
// 애플식의 "과하지 않은" 깊이감만 의도하므로 기본 폭을 작게 잡는다.
// 접근성: prefers-reduced-motion 이면 정적으로 둔다(transform 미적용).

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import type { ReactNode } from 'react';

type HeroParallaxProps = {
  children: ReactNode;
  className?: string;
  /** 스크롤 0→1 동안의 세로 이동 px [시작, 끝] */
  y?: readonly [number, number];
  /** 스크롤 0→1 동안의 스케일 [시작, 끝] */
  scale?: readonly [number, number];
};

export function HeroParallax({
  children,
  className,
  y = [0, -48],
  scale = [1, 1.06],
}: HeroParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const translateY = useTransform(scrollYProgress, [0, 1], [y[0], y[1]]);
  const scaleValue = useTransform(scrollYProgress, [0, 1], [scale[0], scale[1]]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={shouldReduce ? undefined : { y: translateY, scale: scaleValue }}>
        {children}
      </motion.div>
    </div>
  );
}
