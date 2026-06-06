package com.duing.domain.club.service.dto.query;

/**
 * 학생 측 GET /clubs 의 정렬 옵션 enum.
 * 자유 형태 Sort 문자열을 받지 않고 의도된 정렬만 허용하기 위해 enum 으로 가드한다.
 */
public enum ClubSortOption {
    /** 활성 모집의 마감일이 가까운 순. 모집 없는 동아리는 마지막. */
    DEADLINE_SOON,
    /** 등록일(createdAt) DESC. 기본값. */
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
     */
    POPULAR
}
