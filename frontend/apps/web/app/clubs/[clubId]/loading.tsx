import { ClubsRouteLoading } from '../_components/ClubsRouteLoading';

// 동아리 상세 경로 로딩 경계 — 프리페치가 끝나기 전에 이동하면 응답이 흘러오는 동안 이 화면이 보인다(운영 실측 10/7:
// 프리페치 차단·지연 1.5s 에서 0.9초). 스피너 대신 화면 안 로딩과 같은 스켈레톤을 그려, 도착한 본문이 떠오르는 흐름과
// 이어지게 한다. 경계 자체는 그대로 둔다 — 응답 전에 화면을 먼저 넘기는 자리이자 View Transition 4초 데드라인 중단
// (NEXT-DUING-9)을 막으려 둔 장치다(RouteLoading 주석). 멤버 경로(/clubs/<id>/member/…) 이동도 이 경계가 받으므로
// 그림은 도착 경로로 고른다(멤버 화면은 공용 스피너).
export default function Loading() {
  return <ClubsRouteLoading />;
}
