import { ApplyPage } from './_pages/ApplyPage';

// 이 서버 셸을 정적(Full Route Cache 대상)으로 잡아 지원 페이지 진입을 CDN HIT 으로 받게 한다
// — 동아리 상세(#915)·공지 상세와 동일 처방. 공개 동선(동아리 상세→지원)에 남아 있던 마지막
// 동적(ƒ) 라우트라, 가두모집 시즌처럼 지원 트래픽이 몰릴 때 recruitmentId 마다 요청·프리페치가
// 서버리스 함수를 깨우던 것을 차단한다(Active CPU). 미들웨어 인증 가드(/apply/:path*)는 캐시
// 앞단에서 그대로 실행되므로 보호 계약은 변하지 않는다.
// 빈 배열이라 빌드 시점에 미리 만드는 경로는 없고, 첫 요청에서 렌더된 뒤 캐시된다(dynamicParams 기본 true).
// ⚠️ 불변식: 이 셸에는 모집별 데이터가 단 1바이트도 없어야 한다(데이터는 전부 클라이언트 React Query,
// recruitmentId 는 클라이언트가 useParams 로 읽는다). generateMetadata 나 서버 데이터 fetch 를 추가하는 순간
// 이 전제가 깨져 배포 수명 내내 stale 이 서빙된다. 그때는 finite revalidate 와 fail-soft 를 반드시 함께 넣을 것.
//
// 요청별 값도 같이 얼어붙는다 — 셸의 sentry-trace·baggage meta 가 recruitmentId 별로 하나씩 고정된다.
// 트레이싱(tracesSampleRate)을 켤 때는 이 라우트의 캐시 전략을 함께 재검토할 것(clubs/[clubId] 셸과 동일 함정).
export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <ApplyPage />;
}
