import { ClubsRouteLoading } from '../../../_components/ClubsRouteLoading';

// 인터셉트 상세의 로딩 경계 — 부모(app/clubs/loading.tsx)가 병렬 슬롯에도 걸리는 것은 Next 가 "implementation accident" 라 주석한
// 동작이라(layout-router) 업그레이드에 기대지 않고 명시한다. 그림은 도착 경로로 고른다(상세 스켈레톤) — View Transition 4초
// 데드라인 중단(NEXT-DUING-9)을 막는 경계이기도 하다.
export default function Loading() {
  return <ClubsRouteLoading />;
}
