// 공용 스켈레톤 — 구조를 미리 보여줄 수 있는 화면(목록·카드·테이블·상세)의 로딩 전용.
// 컨테이너 하나에만 animate-pulse 를 걸어(합성 1회) 자식 블록 전체가 함께 깜빡이게 한다.
// 학생이 자주 쓰는 화면은 스피너 대신 이걸 우선 사용한다(admin 내부는 LoadingGate 로 충분).

import { cn } from '@/app/_lib/cn';

/** 골격 블록 한 조각 — role/pulse 는 감싸는 컨테이너가 담당한다. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-graysoft', className)} aria-hidden="true" />;
}

type ListRowsSkeletonProps = {
  /** 행 개수 (기본 6) */
  rows?: number;
  /** 행 하나의 크기/모양 — 실제 목록 행을 근사하게 */
  rowClassName?: string;
  /** 스크린리더용 상태 라벨 */
  label?: string;
  className?: string;
};

/** 행 반복형 목록 스켈레톤 — 알림·FAQ·신청 내역처럼 세로 목록 화면의 기본형. */
export function ListRowsSkeleton({
  rows = 6,
  rowClassName,
  label = '목록 불러오는 중',
  className,
}: ListRowsSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('animate-pulse space-y-3 motion-reduce:animate-none', className)}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn('h-[72px] w-full rounded-[14px]', rowClassName)} />
      ))}
    </div>
  );
}

/** 텍스트 단락 스켈레톤 — 상세/본문 영역의 로딩 근사. */
export function TextLinesSkeleton({
  lines = 3,
  label = '내용 불러오는 중',
  className,
}: {
  lines?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('animate-pulse space-y-2.5 motion-reduce:animate-none', className)}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-4', index === lines - 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  );
}
