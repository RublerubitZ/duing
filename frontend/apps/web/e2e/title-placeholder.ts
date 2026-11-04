/**
 * 동아리 공지 영역(ClubsRouteAnnouncer)이 head 에 넣는 자리 표시 <title> 의 표식 — Playwright 는 앱 모듈(@/…)을 불러오지 않아
 * 문자열로 둔다. 값이 컴포넌트의 TITLE_PLACEHOLDER_ATTRIBUTE 와 같은지는 단위 테스트(clubs-route-title-continuity)가 확인한다.
 */
export const TITLE_PLACEHOLDER_ATTRIBUTE = 'data-clubs-title-placeholder';
