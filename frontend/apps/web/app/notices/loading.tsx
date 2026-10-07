import { NoticesRouteLoading } from './_components/NoticesRouteLoading';

// 공지 전용 로딩 경계 — 루트 loading.tsx 대신 이 세그먼트 레이아웃 안에서 걸려, RSC 페치 중에도 크림 캔버스(min-h-lvh)와
// GNB 가 유지된다(문서 높이 붕괴 → 하단 탭바 흔들림 방지). 프리페치가 끝나기 전에 이동하면 응답이 흘러오는 동안
// 이 화면이 보인다(운영 실측 10/7: 1.6초) — 스피너 대신 목록 화면 모양 스켈레톤을 그린다.
// 이 경계는 상세 세그먼트까지 감싸 목록→상세 대기 중에도 잡히므로 그림은 도착 경로로 고른다(NoticesRouteLoading).
export default function Loading() {
  return <NoticesRouteLoading />;
}
