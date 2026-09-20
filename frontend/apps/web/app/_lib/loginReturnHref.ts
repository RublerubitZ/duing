/**
 * 로그인 후 현재 딥링크(pathname+search)로 복귀시키는 `/login` 링크를 만든다.
 *
 * `next` 값의 안전성 검증(오프-오리진·프로토콜 상대경로 차단)은 로그인 쪽 `toLinkRoute` 가 하므로
 * 여기서는 인코딩만 한다. 렌더 중 호출해도 되지만 호출부는 `hydrated` 게이트 안이어야 한다 —
 * 서버 프레임에서는 `/login` 으로 떨어져 하이드레이션 후와 링크가 갈린다.
 */
export function loginReturnHref(): `/${string}` {
  if (typeof window === 'undefined') return '/login';
  return `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}
