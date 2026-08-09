/**
 * 홈에서 동아리 탐색으로 보내는 링크 — 모집중 필터가 걸린 상태로 진입한다.
 *
 * 쿼리 키·값은 탐색 페이지의 파서(`app/clubs/_lib/exploreParams.ts`)와 커플링돼 있다.
 * `recruitment=available` 이 아니면 필터가 걸리지 않은 채 전체 목록이 열린다.
 */
export const RECRUITING_CLUBS_HREF = '/clubs?recruitment=available';
