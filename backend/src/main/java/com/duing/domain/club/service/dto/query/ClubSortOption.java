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
    ALPHABETICAL
}
