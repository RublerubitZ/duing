/**
 * 가입 링크 주소 단일 소스 — 부원 초대·모집 가입·총동연 콘솔이 같은 형태(`/join/{code}`)를 쓴다.
 *
 * 서버 렌더 중에는 origin 을 알 수 없으므로 상대 경로로 떨어진다. 복사 버튼처럼 클릭 시점에만
 * 값이 필요한 곳은 브라우저에서 다시 계산되므로 절대 주소를 얻는다.
 */
export function joinLinkUrl(code: string): string {
  const joinPath = `/join/${code}`;
  return typeof window === 'undefined' ? joinPath : `${window.location.origin}${joinPath}`;
}
