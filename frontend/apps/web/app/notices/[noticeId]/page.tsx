import type { Metadata } from 'next';

import type { NoticeDetail } from '@duing/types';
import { noticeQueryKeys } from '@duing/hooks/query-keys';

import { htmlToPlainText } from '@/app/_lib/htmlToPlainText';
import { parsePositiveIdParam } from '@/app/_lib/idParam';
import { toMetaDescription } from '@/app/_lib/metaDescription';
import { fetchPublicNoticeDetail, type PublicContent } from '@/app/_lib/public-content';
import { SeededQuery } from '@/app/_lib/SeededQuery';

import { NoticeDetailPage } from './_pages/NoticeDetailPage';

type Props = {
  params: Promise<{ noticeId: string }>;
};

// 24시간 ISR — 공개 소식 상세를 초기 HTML 에 담아 크롤러(검색·애드센스)가 본문을 읽게 한다(동아리 상세와 같은 처방).
// 첫 요청 때 생성해 캐시하고 하루에 한 번 다시 만든다(Hobby Active CPU 상한: 소식 수 × 하루 1회).
// 브라우저는 시드(updatedAt 0) 덕에 마운트 때 지금처럼 최신 데이터를 다시 받는다(SeededQuery).
// 익명 조회라 동아리 공지(CLUB_SCOPED)는 404 → noindex 셸이 되고, 부원은 클라이언트가 쿠키로 받아 그대로 본다.
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트가 돼 요청마다 함수가 돈다 — 쓰지 말 것.
// 요청별 값이 HTML 에 굳는 문제는 그대로다 — sentry-trace·baggage meta 가 경로별로 고정되므로 트레이싱
// (tracesSampleRate)을 켤 때 이 라우트의 캐시 전략을 함께 재검토할 것.
export const revalidate = 86400;

// 빌드 때 미리 만드는 경로는 없다 — 빌드가 백엔드에 의존하지 않게 하고, 경로마다 첫 요청 때 생성한다.
export function generateStaticParams() {
  return [];
}

function describeNotice(notice: NoticeDetail): string {
  // MARKDOWN 원문은 기호(##·**)가 설명에 남는다 — 운영 공개 소식은 모두 HTML 이고 summary 가 먼저라 그대로 둔다.
  const source =
    notice.summary.trim() ||
    (notice.contentFormat === 'MARKDOWN' ? notice.content : htmlToPlainText(notice.content));
  return toMetaDescription(source, `${notice.title} — 두잉 소식`);
}

async function loadNotice(
  rawNoticeId: string,
): Promise<{ noticeId: number | null; content: PublicContent<NoticeDetail> }> {
  const noticeId = parsePositiveIdParam(rawNoticeId);
  if (noticeId === null) return { noticeId, content: { status: 'notFound' } };
  return { noticeId, content: await fetchPublicNoticeDetail(noticeId) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { noticeId: rawNoticeId } = await params;
  const { noticeId, content } = await loadNotice(rawNoticeId);
  // 없거나 동아리 공지 — notFound() 는 쓰지 않는다(결과가 24시간 캐시되면 그 사이 공개된 소식이 "없음"으로 남는다).
  // 셸은 클라이언트가 404 를 판정해 "볼 수 없음" 을 그리고(부원은 쿠키로 받아 본다), 색인에서만 뺀다.
  if (content.status === 'notFound') return { robots: { index: false, follow: true } };
  if (content.status === 'unavailable') return {};
  return {
    title: `${content.data.title} | 두잉`,
    description: describeNotice(content.data),
    alternates: { canonical: `/notices/${noticeId}` },
  };
}

export default async function Page({ params }: Props) {
  const { noticeId: rawNoticeId } = await params;
  const { noticeId, content } = await loadNotice(rawNoticeId);
  const page = <NoticeDetailPage />;
  if (content.status !== 'found' || noticeId === null) return page;
  return (
    <SeededQuery queryKey={noticeQueryKeys.detail(noticeId)} data={content.data}>
      {page}
    </SeededQuery>
  );
}
