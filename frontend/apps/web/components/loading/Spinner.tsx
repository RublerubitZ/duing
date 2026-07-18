// 공용 스피너 — 상태 확인(인증·권한·이동)과 버튼 pending 등 "구조를 미리 보여줄 수 없는" 로딩 전용.
// 데이터 목록/카드/상세처럼 구조를 아는 화면은 스피너 대신 Skeleton(components/loading/Skeleton.tsx)을 쓴다.
// transform 회전만 사용(합성 친화). 정보 전달용 모션이라 reduced-motion 에서도 회전을 유지한다(장식 아님).
// 접근성: svg 자체는 aria-hidden — 의미 부여는 감싸는 쪽에서 role="status" + aria-label 로 한다(LoadingGate 참고).

import { cn } from '@/app/_lib/cn';

type SpinnerProps = {
  /** px 크기 (기본 16) */
  size?: number;
  className?: string;
};

export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 버튼 pending 표시 — 라벨은 그대로 두고 앞에 붙인다: `{isPending && <ButtonSpinner />}저장`.
 * "저장 중…" 처럼 라벨을 바꾸는 패턴은 버튼 폭이 출렁이므로 금지.
 * `.btn` 은 inline-flex + gap-2 라 마진이 필요 없고, 일반 버튼은 className 으로 간격을 준다.
 */
export function ButtonSpinner({ className }: { className?: string }) {
  return <Spinner size={14} className={cn('shrink-0', className)} />;
}
