import { ClubDetailPage } from './_pages/ClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

// 이 서버 셸을 정적(Full Route Cache 대상)으로 잡아 <Link> 뷰포트 프리페치를 CDN HIT 으로 받게 한다.
// 빈 배열이라 빌드 시점에 미리 만드는 경로는 없고, 첫 요청에서 렌더된 뒤 캐시된다(dynamicParams 기본 true).
// ⚠️ 불변식: 이 셸에는 동아리별 데이터가 단 1바이트도 없어야 한다(데이터는 전부 클라이언트 React Query).
// generateMetadata 나 서버 데이터 fetch 를 추가하는 순간 이 전제가 깨져 배포 수명 내내 stale 이 서빙된다.
// 그때는 finite revalidate 와 fetch 실패 시 fail-soft 를 반드시 함께 넣을 것.
export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <ClubDetailPage clubId={Number(clubId)} />;
}
