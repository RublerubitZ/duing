import { ClubDetailPage } from './_pages/ClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

// 이 서버 셸을 정적(Full Route Cache 대상)으로 잡아 <Link> 뷰포트 프리페치를 CDN HIT 으로 받게 한다.
// 빈 배열이라 빌드 시점에 미리 만드는 경로는 없고, 첫 요청에서 렌더된 뒤 캐시된다(dynamicParams 기본 true).
// ⚠️ 불변식: 이 셸에는 동아리별 데이터가 단 1바이트도 없어야 한다(데이터는 전부 클라이언트 React Query).
// generateMetadata 나 서버 데이터 fetch 를 추가하는 순간 이 전제가 깨져 배포 수명 내내 stale 이 서빙된다.
// 그때는 finite revalidate 와 fetch 실패 시 fail-soft 를 반드시 함께 넣을 것.
//
// 요청별 값도 같이 얼어붙는다 — 셸의 sentry-trace·baggage meta 가 clubId 별로 하나씩 고정된다.
// tracesSampleRate 가 FE·edge·server 전부 0 인 지금은 무해하지만, 트레이싱을 켜면 그 라우트의
// 모든 방문자 pageload 가 한 트레이스에 엮이고 샘플링 결정까지 얼어 전원 샘플/전원 미샘플이 된다.
// 트레이싱을 켤 때 이 라우트의 캐시 전략을 함께 재검토할 것.
export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <ClubDetailPage clubId={Number(clubId)} />;
}
