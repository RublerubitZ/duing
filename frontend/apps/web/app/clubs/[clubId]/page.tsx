import type { Metadata } from 'next';

import type { ClubDetail } from '@duing/types';
import { clubQueryKeys } from '@duing/hooks/query-keys';

import { parsePositiveIdParam } from '@/app/_lib/idParam';
import { toMetaDescription } from '@/app/_lib/metaDescription';
import { fetchPublicClubDetail, type PublicContent } from '@/app/_lib/public-content';
import { SeededQuery } from '@/app/_lib/SeededQuery';

import { descriptionToPlainText } from './_lib/descriptionText';
import { ClubDetailPage } from './_pages/ClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

// 24시간 ISR — 공개 동아리 상세를 초기 HTML 에 담아 크롤러(검색·애드센스)가 본문을 읽게 한다.
// 첫 요청 때 생성해 캐시하고 하루에 한 번 다시 만든다(Hobby Active CPU 상한: 동아리 수 × 하루 1회).
// 브라우저는 시드(updatedAt 0) 덕에 마운트 때 지금처럼 최신 데이터를 다시 받는다(SeededQuery).
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트가 돼 요청마다 함수가 돈다 — 쓰지 말 것.
// 요청별 값이 HTML 에 굳는 문제는 그대로다 — sentry-trace·baggage meta 가 경로별로 고정되므로 트레이싱
// (tracesSampleRate)을 켤 때 이 라우트의 캐시 전략을 함께 재검토할 것.
export const revalidate = 86400;

// 빌드 때 미리 만드는 경로는 없다 — 빌드가 백엔드에 의존하지 않게 하고, 경로마다 첫 요청 때 생성한다.
export function generateStaticParams() {
  return [];
}

function describeClub(club: ClubDetail): string {
  const source = club.tagline?.trim() || (club.description ? descriptionToPlainText(club.description) : '');
  return toMetaDescription(source, `${club.name} — 대구대학교 동아리`);
}

async function loadClub(
  rawClubId: string,
): Promise<{ clubId: number | null; content: PublicContent<ClubDetail> }> {
  const clubId = parsePositiveIdParam(rawClubId);
  if (clubId === null) return { clubId, content: { status: 'notFound' } };
  return { clubId, content: await fetchPublicClubDetail(clubId) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clubId: rawClubId } = await params;
  const { clubId, content } = await loadClub(rawClubId);
  // 없거나 비공개 — notFound() 는 쓰지 않는다(결과가 24시간 캐시되면 그 사이 승인된 동아리가 "없음"으로 남는다).
  // 셸은 클라이언트가 404 를 판정해 "볼 수 없음" 을 그리고, 색인에서만 뺀다.
  if (content.status === 'notFound') return { robots: { index: false, follow: true } };
  if (content.status === 'unavailable') return {};
  return {
    title: `${content.data.name} | 두잉`,
    description: describeClub(content.data),
    alternates: { canonical: `/clubs/${clubId}` },
  };
}

export default async function Page({ params }: Props) {
  const { clubId: rawClubId } = await params;
  const { clubId, content } = await loadClub(rawClubId);
  const page = <ClubDetailPage clubId={Number(rawClubId)} />;
  if (content.status !== 'found' || clubId === null) return page;
  // 연락처(회장 휴대전화)는 시드에서 뺀다 — ISR HTML·RSC 페이로드에 박히면 회장이 공개 범위를 줄여도 최대 24시간
  // 캐시에 남고 원문 HTML 을 읽는 수집기가 번호를 가져간다. 마운트 때 재요청(updatedAt 0)이 뷰어 권한대로 채운다.
  return (
    <SeededQuery queryKey={clubQueryKeys.detail(clubId)} data={{ ...content.data, contactPhone: null }}>
      {page}
    </SeededQuery>
  );
}
