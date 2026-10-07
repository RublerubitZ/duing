import type { Metadata } from 'next';
import { Suspense } from 'react';

import { clubQueryKeys } from '@duing/hooks/query-keys';

import { fetchPublicClubList } from '@/app/_lib/public-content';
import { SeededQuery } from '@/app/_lib/SeededQuery';

import { ClubExploreFallback } from './_components/ClubExploreFallback';
import { DEFAULT_CLUB_LIST_PARAMS } from './_lib/exploreParams';
import { ClubExplorePage } from './_pages/ClubExplorePage';

export const metadata: Metadata = {
  title: '동아리 탐색 | 두잉',
  description: '대구대학교 동아리를 분야·모집 상태별로 찾아보세요.',
  alternates: { canonical: '/clubs' },
};

// 1시간 ISR — 탐색 화면은 필터를 URL 에서 읽어(useSearchParams) 정적 렌더가 Suspense 경계까지 클라이언트 렌더로
// 넘어간다. 그래서 fallback 자리에 쿼리 없는 첫 진입의 기본 목록(추천순 첫 페이지)을 서버가 그려 크롤러가 읽게 하고,
// 같은 데이터를 시드해 JS 가 이어받을 때 스켈레톤 없이 이어지게 한다(updatedAt 0 이라 마운트 때 다시 받는다).
// 추천순은 백엔드가 매시 정각에 섞고, 정각 잡이 섞은 직후 재생성을 요청한다(/api/internal/revalidate). 3600 은 그
// 요청이 빠질 때의 안전망이다(다른 공개 화면은 24시간). 재생성 실패: 주기 만료 뒤면 직전 캐시본을 계속 내지만, 정각
// 요청으로 즉시 만료된 뒤에는 Next 가 직전본 없이 블로킹 렌더해 그 요청이 오류가 되고 다음 요청이 다시 시도한다.
// 쿼리로 들어오면(/clubs?category=…) JS 가 로드되기 전 잠깐 기본 목록이 보였다가 그 필터 목록으로 바뀐다.
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트가 돼 요청마다 함수가 돈다 — 쓰지 말 것.
export const revalidate = 3600;

export default async function Page() {
  const content = await fetchPublicClubList(DEFAULT_CLUB_LIST_PARAMS);
  // 빈 목록은 기본 목록으로 쓰지 않는다 — DB 복구 중 같은 순간의 빈 200 이 1시간 굳지 않게 장애 때처럼 스켈레톤·시드 없이.
  const defaultList = content.status === 'found' && content.data.content.length > 0 ? content.data : null;
  const page = (
    <Suspense fallback={<ClubExploreFallback page={defaultList} />}>
      <ClubExplorePage />
    </Suspense>
  );
  if (defaultList === null) return page;
  return (
    <SeededQuery queryKey={clubQueryKeys.list(DEFAULT_CLUB_LIST_PARAMS)} data={defaultList}>
      {page}
    </SeededQuery>
  );
}
