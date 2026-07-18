import { RouteLoading } from '../_components/RouteLoading';

// 홈 전용 로딩 경계 — 루트 loading.tsx 대신 (home) 레이아웃 안에서 걸려,
// RSC 페치 중에도 상단 GNB(HomeNav)가 유지된다. 프리페치에 포함되어 클릭 즉시 커밋도 보장(NEXT-DUING-9).
export default function Loading() {
  return <RouteLoading />;
}
