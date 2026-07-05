// 상세 조회 API 가 없어(스펙 §6) 목록·수정 화면이 공유하는 "전체 목록" 조회 창 크기.
// 두 화면이 같은 쿼리 파라미터(page 0, size 500)를 쓰면 React Query 캐시도 자연 공유된다.
// 백엔드 reorder 는 전체 id 집합 일치를 검증하므로, 이 창을 넘는(501개 이상) 경우
// AdminFaqListPage 가 fullListIncomplete 가드로 순서 이동을 잠근다.
export const FAQ_FULL_LIST_SIZE = 500;
