package com.duing.domain.club.service.dto.query;

/**
 * 학생 측 GET /clubs 의 정렬 옵션 enum.
 * 자유 형태 Sort 문자열을 받지 않고 의도된 정렬만 허용하기 위해 enum 으로 가드한다.
 */
public enum ClubSortOption {
    /**
     * 추천순. 기본값. 정책·산식은 {@code ClubRecommendationPolicy} 참고.
     * <ol>
     *   <li>모집 상태 그룹: 모집중(1) → 상시모집(2) → 예정·마감·없음(3, 내부 상태 우선순위 없음)</li>
     *   <li>그룹 내부: KST 1시간 bucket deterministic random 70% + 활동점수(club_metric) 30% DESC</li>
     *   <li>{@code club.id} ASC (tie-break — 동점 시 페이지네이션 안정화)</li>
     * </ol>
     */
    RECOMMENDED,
    /** 활성 모집의 마감일이 가까운 순. 모집 없는 동아리는 마지막. */
    DEADLINE_SOON,
    /**
     * @deprecated 전환기 호환 alias — {@link #RECOMMENDED} 와 동일 동작. 배포 전환기의 stale FE 번들이
     * {@code sort=RECENT} 를 명시 전송하므로 enum 을 즉시 지우면 바인딩 400 으로 탐색이 깨진다.
     * FE 반영이 완전히 퍼진 다음 릴리스에서 제거한다.
     */
    @Deprecated
    RECENT,
    /** 이름 가나다순 ASC. */
    ALPHABETICAL,
    /**
     * 인기순. 다음 우선순위로 정렬:
     * <ol>
     *   <li>활성 모집 지원자수 합 DESC</li>
     *   <li>즐겨찾기 수 DESC</li>
     *   <li>가장 최근 활성 모집의 시작일 DESC (활성 모집 없으면 NULL → NULLS LAST)</li>
     *   <li>{@code club.createdAt} DESC (최종 tiebreak)</li>
     * </ol>
     * 활성 모집이 없는 동아리는 tier 1 = 0 으로 자연 후순위, tier 3 NULL → NULLS LAST.
     * "현재 모집 중인 동아리 중 인기순" 사용 시 {@code recruitmentStatus=AVAILABLE} 와 조합.
     * 탐색 추천순(RECOMMENDED)과는 별개 정렬이다.
     */
    POPULAR,
    /**
     * 관심도순. 홈 "관심도가 높은 동아리" 섹션 전용.
     * <ol>
     *   <li>club_metric.interest_score DESC — 최근 7일 조회의 반감기 3일 감쇠 합(65%)과 감쇠 없는
     *       순방문자 수(35%)를 합성한 값(산식은 {@code ClubInterestPolicy}). 같은 날 하루씩만 본
     *       경우끼리는 오래된 쪽이 사람 약 2배 이상이어야 오늘을 앞선다. 여러 날에 걸친 반복 조회는
     *       사람 수가 같아도 감쇠 축을 여러 번 쌓으므로, "사람 수가 같으면 최근 쪽이 앞선다"로 읽으면
     *       안 된다. metric 행이 없으면 coalesce 로 0 점과 같은 자리에 두어 아래 폴백이 순서를 정한다</li>
     *   <li>동점 시 {@link #POPULAR} 티어 전체로 폴백 — 지원자수 → 즐겨찾기수 → 최근 모집 시작일 → 생성일</li>
     * </ol>
     * 폴백을 두는 이유는 콜드 스타트다. 집계 배포 직후·방학처럼 조회가 전무한 구간에서는 전 동아리
     * interest_score 가 0 이라, 폴백이 없으면 정렬이 사실상 무작위로 보인다.
     * 회원 수는 어떤 티어에서도 쓰지 않는다.
     */
    INTEREST
}
