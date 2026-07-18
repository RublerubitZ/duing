'use client';

// 스크롤 진입 시 자연스럽게 떠오르는 등장 모션 — 두잉 이징(ease-duing)과 동일한 cubic-bezier 사용.
// 접근성: prefers-reduced-motion 이면 whileInView(스크롤 트리거) 대신 animate 로 마운트 즉시 노출한다.
//   (SSR 은 reduced 여부를 모르므로 initial=opacity:0 로 그려지는데, reduced 에서 whileInView 를 빼면
//    0→1 전이 트리거가 사라져 콘텐츠가 영구히 안 보이게 된다. animate 로 마운트 시 즉시 1 로 올린다.)
// 주의: initial 은 reduced 여부와 무관하게 상수로 둔다 — SSR/클라이언트 첫 렌더 마크업을 동일하게 유지해
//   하이드레이션 불일치를 막는다. initial 을 shouldReduce 로 분기하면 SSR(opacity:0) vs 클라이언트(opacity:1)
//   마크업이 어긋나 mismatch 가 난다. reduced 의 즉시 노출은 initial 이 아니라 animate 가 담당한다.
// 서버 컴포넌트 섹션을 children 으로 감싸 쓰는 클라이언트 래퍼 — above-the-fold 핵심 콘텐츠엔 쓰지 않는다.

// 번들: motion 전체 배럴 대신 LazyMotion(domAnimation)+m — 이 컴포넌트를 쓰는 라우트 청크가 가벼워진다.
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

type FadeInProps = {
  children: ReactNode;
  /** 등장 지연(초) — 연속 섹션을 살짝 시차 두고 띄울 때 */
  delay?: number;
  /** 떠오르는 거리(px) */
  y?: number;
  className?: string;
};

export function FadeIn({ children, delay = 0, y = 16, className }: FadeInProps) {
  const shouldReduce = useReducedMotion();

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className={className}
        initial={{ opacity: 0, y }}
        animate={shouldReduce ? { opacity: 1, y: 0 } : undefined}
        whileInView={shouldReduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
