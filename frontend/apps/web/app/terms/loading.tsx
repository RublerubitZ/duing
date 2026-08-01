import { RouteLoading } from '@/app/_components/RouteLoading';

// 약관 전용 로딩 경계 — 루트 loading.tsx 대신 이 세그먼트 레이아웃 안에서 걸려,
// RSC 페치 중에도 크림 캔버스(min-h-dvh)와 GNB 가 유지된다(문서 높이 붕괴 → 하단 탭바 흔들림 방지).
export default function Loading() {
  return <RouteLoading />;
}
