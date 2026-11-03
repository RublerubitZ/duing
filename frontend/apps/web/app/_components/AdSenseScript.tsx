// client ID 는 공개 식별자다(시크릿 아님).
const ADSENSE_LOADER_SRC =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3402309590379365';

/**
 * Google AdSense 로더 스크립트 — 레이아웃(AdSenseLoader)과 콘텐츠 상세 page.tsx 가 함께 쓴다.
 *
 * <p>구글 안내가 "각 페이지의 &lt;head&gt; 안"을 요구하므로 next/script(하이드레이션 뒤 body 주입)가 아니라 평문 태그를 반환한다.
 * React 19 는 `<script async src>` 를 서버·클라이언트 어디서 렌더하든 head 로 호이스팅하고 SSR HTML 의 head 에 직렬화한다 —
 * 크롤러가 초기 HTML 에서 읽는다(#1126). 같은 src 는 한 문서에 한 번만 싣는다. async 라 렌더를 막지 않는다.
 */
export function AdSenseScript() {
  return <script async src={ADSENSE_LOADER_SRC} crossOrigin="anonymous" />;
}
