import { TextLinesSkeleton } from '@/components/loading/Skeleton';

/**
 * 동아리 상세 로딩 스켈레톤 — 화면 안 로딩 분기(ClubDetailPage)와 경로 로딩 경계(loading.tsx)가 같은 모양을 쓴다.
 * 150ms 안에 끝나는 기다림에는 보이지 않는다(delayed-show). 펄스(animate-pulse)와 같은 요소에 걸면 animation 축약끼리
 * 덮어써 펄스가 꺼지므로 지연은 래퍼에 둔다. 캔버스 높이는 ClubsLayout(min-h-dvh)이 지킨다.
 */
export function ClubDetailSkeleton() {
  return (
    <div className="delayed-show mx-auto max-w-layout px-4 py-10 sm:px-6 md:px-10">
      <TextLinesSkeleton lines={8} label="동아리 정보 불러오는 중" />
    </div>
  );
}
