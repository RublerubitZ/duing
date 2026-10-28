import { Suspense } from 'react';
import type { Metadata } from 'next';

import { federationFaqQueryKeys } from '@duing/hooks/query-keys';

import { fetchPublicFaqCategories, fetchPublicFaqList } from '@/app/_lib/public-content';
import { SeededQuery } from '@/app/_lib/SeededQuery';

import { FaqPageFallback } from './_components/FaqPageFallback';
import { DEFAULT_FAQ_LIST_PARAMS } from './_lib/faqParams';
import { FaqPage } from './_pages/FaqPage';

export const metadata: Metadata = {
  title: '자주 묻는 질문 | 두잉',
  description: '총동아리연합회에 자주 묻는 질문과 답변을 확인하세요.',
  alternates: { canonical: '/faq' },
};

// 24시간 ISR — FAQ 화면은 필터를 URL 에서 읽어(useSearchParams) 정적 렌더가 Suspense 경계까지 클라이언트 렌더로 넘어간다.
// 그래서 fallback 자리에 쿼리 없는 첫 진입의 기본 목록(전체·첫 페이지)을 서버가 그려 크롤러가 질문·답변을 읽게 하고, 같은
// 데이터를 시드해 JS 가 이어받을 때 스켈레톤 없이 이어지게 한다(updatedAt 0 이라 마운트 때 다시 받는다).
// 빈 목록·장애면 시드 없이 지금 로딩 화면이다. 런타임 재생성 장애는 두 로더 모두 throw 해 직전 캐시본을 유지하고,
// 빌드 국면에서 백엔드가 응답하지 않으면 시드 없는 셸로 만들어져 다음 재생성(최대 24시간 뒤)까지 남는다.
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트가 돼 요청마다 함수가 돈다 — 쓰지 말 것.
export const revalidate = 86400;

export default async function Page() {
  const [listContent, categoriesContent] = await Promise.all([
    fetchPublicFaqList(DEFAULT_FAQ_LIST_PARAMS),
    fetchPublicFaqCategories(),
  ]);
  // 빈 목록은 기본 목록으로 쓰지 않는다 — 복구 중 같은 순간의 빈 200 이 24시간 굳지 않게(동아리 탐색·소식과 같은 규칙).
  const defaultList =
    listContent.status === 'found' && listContent.data.content.length > 0 ? listContent.data : null;
  // 목록이 없으면 카테고리도 시드하지 않는다 — 화면이 스켈레톤부터 시작하는 지금 동작 그대로.
  const categories = defaultList !== null && categoriesContent.status === 'found' ? categoriesContent.data : null;
  const page = (
    <Suspense fallback={<FaqPageFallback page={defaultList} categories={categories} />}>
      <FaqPage />
    </Suspense>
  );
  if (defaultList === null) return page;
  return (
    <SeededQuery queryKey={federationFaqQueryKeys.list(DEFAULT_FAQ_LIST_PARAMS)} data={defaultList}>
      {categories === null ? (
        page
      ) : (
        <SeededQuery queryKey={federationFaqQueryKeys.categories} data={categories}>
          {page}
        </SeededQuery>
      )}
    </SeededQuery>
  );
}
