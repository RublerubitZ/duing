'use client';

// Hero 배경 장식 — 세이지 블러 원이 스크롤에 따라 은은하게 떠내려간다(배경 요소 이동).
// 순수 장식이라 pointer-events-none·aria-hidden. Hero 섹션의 overflow-hidden 안에서만 움직인다.
// 접근성: prefers-reduced-motion 이면 정적으로 둔다.

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

export function HeroBackdrop() {
  const shouldReduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 700], [0, 140]);

  return (
    <motion.div
      aria-hidden
      style={shouldReduce ? undefined : { y }}
      className="pointer-events-none absolute -right-32 -top-32 -z-0 h-[460px] w-[460px] rounded-full bg-sage-soft/40 blur-3xl"
    />
  );
}
