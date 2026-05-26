'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import type { CSSProperties } from 'react';

type FeatureSectionProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * 스크롤로 뷰포트에 진입할 때 .feature-visible 클래스를 추가한다.
 * 자식 요소에 .feature-text-left / .feature-text-right / .feature-visual
 * 클래스를 붙이면 globals.css 에 정의된 reveal 애니메이션이 적용된다.
 */
export function FeatureSection({ children, className, style }: FeatureSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('feature-visible');
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.18 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
