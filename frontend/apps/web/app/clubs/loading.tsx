import { ClubsRouteLoading } from './_components/ClubsRouteLoading';

// 탐색(/clubs) 세그먼트 로딩 경계 — 루트 loading.tsx 대신 이 세그먼트 레이아웃(ClubsLayout) 안에서 걸려, /clubs 세그먼트가
// 준비된 뒤 페이지·하위 세그먼트를 기다리는 동안 상단 탐색 메뉴(ExploreNav)와 크림 캔버스가 남는다(운영 실측 10/7: 루트
// 경계일 때 1.7초 동안 메뉴가 사라졌다). 세그먼트 자체가 아직 없으면 루트 경계가 받는다.
// 하위 세그먼트([clubId]·member)까지 감싸므로 그림은 ClubsRouteLoading 이 도착 경로로 고른다. 150ms 안에 끝나는 이동에는
// 보이지 않는다 — 지연은 래퍼에, 펄스는 스켈레톤 안쪽에 둔다(같은 요소면 animation 축약끼리 덮어써 펄스가 꺼진다).
// 상태 코드 동작은 그대로다 — 루트 경계가 이미 /clubs 전체를 감싸고, 이 아래에 notFound()·redirect() 를 부르는 페이지가 없다.
export default function Loading() {
  return <ClubsRouteLoading />;
}
