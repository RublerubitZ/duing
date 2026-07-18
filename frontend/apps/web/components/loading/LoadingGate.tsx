// 상태 확인용 중앙 스피너 게이트 — 로그인/권한 확인, 리다이렉트 대기, admin·manage 내부 게이트,
// 라우트 전환(RouteLoading) 등 "구조를 미리 보여줄 수 없는" 전체 영역 로딩 전용.
// 데이터 목록/카드/상세처럼 구조를 아는 학생 화면은 이 대신 Skeleton 을 쓴다.
// Flicker 방지: delayed-show(globals.css)로 150ms 안에 끝나는 로딩은 스피너가 아예 보이지 않는다.

import { cn } from '@/app/_lib/cn';
import { Spinner } from './Spinner';

type Props = {
  /** 스크린리더용 상태 라벨 (기본 "불러오는 중") */
  label?: string;
  /** 높이·여백 조정용 — 기본은 콘텐츠 영역 중앙(min-h-[40vh]) */
  className?: string;
  /** true 면 지연 없이 즉시 표시 — 확실히 긴 로딩(전체 페이지 첫 진입 등)에만 */
  immediate?: boolean;
};

export function LoadingGate({ label = '불러오는 중', className, immediate = false }: Props) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        'flex min-h-[40vh] items-center justify-center',
        !immediate && 'delayed-show',
        className,
      )}
    >
      <Spinner size={24} className="text-charcoal-3" />
    </div>
  );
}
