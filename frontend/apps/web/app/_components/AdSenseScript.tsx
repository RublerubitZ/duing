// client ID 는 공개 식별자다(시크릿 아님).
const ADSENSE_LOADER_SRC =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3402309590379365';

/**
 * Google AdSense 로더 스크립트 — 레이아웃(AdSenseLoader)과 콘텐츠 상세 page.tsx 가 함께 쓴다.
 *
 * <p>구글 안내가 "각 페이지의 &lt;head&gt; 안"을 요구하므로 next/script(하이드레이션 뒤 body 주입)가 아니라 평문 태그를 반환한다.
 * React 19 는 `<script async src>` 를 head 로 호이스팅하지만, SSR HTML 의 head 에 직렬화되는 건 셸을 내보내기 전에 렌더가 닿은
 * 스크립트뿐이다 — 스트리밍 동적 렌더에서 Suspense 경계 안이면 body 로 간다. 레이아웃 로더(셸)와 동아리·소식 상세(ISR 프리렌더는
 * 렌더를 전부 기다린 뒤 직렬화)는 head 에 들어가 크롤러가 초기 HTML 에서 읽는다(#1126) — 상세를 동적 라우트로 바꾸면 이 전제가 깨진다.
 * 같은 src 는 한 문서에 한 번만 싣는다. async 라 렌더를 막지 않는다.
 */
export function AdSenseScript() {
  return <script async src={ADSENSE_LOADER_SRC} crossOrigin="anonymous" />;
}
