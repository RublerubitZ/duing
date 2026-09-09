/**
 * 가입 링크 주소 단일 소스 — 부원 초대·모집 가입·총동연 콘솔이 같은 형태(`/join/{code}`)를 쓴다.
 *
 * 서버 렌더 중에는 origin 을 알 수 없으므로 상대 경로로 떨어진다. 복사 버튼처럼 클릭 시점에만
 * 값이 필요한 곳은 브라우저에서 다시 계산되므로 절대 주소를 얻는다. 주소를 본문 텍스트로 그리는
 * 곳은 서버 프리페치를 붙이면 상대/절대가 어긋나 하이드레이션이 깨지므로 클라이언트 전용으로 둔다.
 */
export function joinLinkUrl(code: string): string {
  const joinPath = `/join/${code}`;
  return typeof window === 'undefined' ? joinPath : `${window.location.origin}${joinPath}`;
}
