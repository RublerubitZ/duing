import type { Metadata } from 'next';

import { noticeQueryKeys } from '@duing/hooks/query-keys';

import { fetchPublicNoticeList } from '@/app/_lib/public-content';
import { SeededQuery } from '@/app/_lib/SeededQuery';

import { DEFAULT_NOTICE_LIST_PARAMS } from './_lib/noticeListDefaults';
import { NoticePage } from './_pages/NoticePage';

export const metadata: Metadata = { title: '소식 | 두잉', alternates: { canonical: '/notices' } };

// 24시간 ISR — 공개 소식 목록의 첫 진입 화면(학교 공지·첫 페이지)을 초기 HTML 에 담아 크롤러가 목록과 상세 링크를
// 읽게 한다. 시드는 첫 진입 키 하나뿐이다 — 카테고리·검색·페이지·출처를 바꾸면 지금처럼 클라이언트가 받는다.
// 브라우저는 시드(updatedAt 0) 덕에 마운트 때 다시 받는다 — 로그인 사용자는 자기 권한의 목록으로 바뀐다.
// 빌드 때 프리렌더되는 정적 라우트라 빌드 국면에서 백엔드가 응답하지 않으면 시드 없는 셸로 만들어지고,
// 다음 재생성 때 채워진다(런타임 재생성 장애는 throw 해 직전 캐시본을 유지한다).
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트가 돼 요청마다 함수가 돈다 — 쓰지 말 것.
export const revalidate = 86400;

export default async function Page() {
  const content = await fetchPublicNoticeList(DEFAULT_NOTICE_LIST_PARAMS);
  const page = <NoticePage />;
  if (content.status !== 'found') return page;
  return (
    <SeededQuery queryKey={noticeQueryKeys.list(DEFAULT_NOTICE_LIST_PARAMS)} data={content.data}>
      {page}
    </SeededQuery>
  );
}
