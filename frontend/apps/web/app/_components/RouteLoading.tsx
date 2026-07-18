import { LoadingGate } from '@/components/loading/LoadingGate';

// 라우트 전환용 공용 로딩 화면 — 루트·동적 라우트의 loading.tsx 가 사용한다.
// 동적 라우트는 클릭 시점에 풀 RSC 페이로드 fetch 가 필요해, 로딩 경계가 없으면 느린 회선에서
// 커밋이 fetch 완료까지 밀려 View Transition 의 브라우저 데드라인(~4s)을 넘긴다
// (TimeoutError: Transition was aborted…, Sentry NEXT-DUING-9 — 재현 실험으로 확인).
// 이 경계는 프리페치에 포함되어 클릭 즉시 커밋을 가능하게 한다.
// 스피너는 delayed-show(150ms)로 늦게 그려지지만 경계 자체는 즉시 커밋되므로 VT 데드라인과 무관.
export function RouteLoading() {
  return <LoadingGate label="페이지 불러오는 중" className="min-h-[60vh]" />;
}
