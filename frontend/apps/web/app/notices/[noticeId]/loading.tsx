import { NoticeDetailSkeleton } from '../_components/NoticeDetailSkeleton';

// 소식 상세 경로 로딩 경계 — 프리페치가 끝나기 전에 이동하면 응답이 흘러오는 동안 이 화면이 보인다(운영 실측 10/7:
// 프리페치 차단·지연 1.5s 에서 2.3초). 스피너 대신 화면 안 로딩과 같은 스켈레톤(상단 바 + 본문 자리)을 그린다.
// 경계 자체는 그대로 둔다(RouteLoading 주석 — NEXT-DUING-9).
export default function Loading() {
  return <NoticeDetailSkeleton />;
}
