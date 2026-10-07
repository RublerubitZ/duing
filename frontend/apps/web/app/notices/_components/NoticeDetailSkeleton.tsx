import { TextLinesSkeleton } from '@/components/loading/Skeleton';

import { NoticeDetailTopBar } from './NoticeDetailTopBar';

/**
 * 소식 상세 로딩 스켈레톤 — 화면 안 로딩 분기(NoticeDetailPage)와 경로 로딩 경계(loading.tsx)가 같은 모양을 쓴다.
 * 상단 바는 곧바로 쓸 수 있는 요소라 지연·펄스에서 뺀다. 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky 면
 * 라우터 자동 스크롤 기준에서 제외된다. 지연은 래퍼, 펄스는 안쪽(같은 요소면 animation 축약끼리 덮어쓴다).
 */
export function NoticeDetailSkeleton() {
  return (
    <div>
      <NoticeDetailTopBar />
      <div className="delayed-show max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
        <TextLinesSkeleton lines={6} label="공지 불러오는 중" />
      </div>
    </div>
  );
}
