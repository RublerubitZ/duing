package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;

/**
 * 총동연(ADMIN) 콘솔 전용 동아리 검색 조건.
 * 학생 측 {@link ClubSearchCondition} 과 달리 모든 상태(PENDING_APPROVAL/ACTIVE/INACTIVE) 를 조회할 수 있다.
 *
 * @param status   null 이면 모든 상태 반환
 * @param category null 이면 모든 카테고리
 * @param division null 또는 공백이면 분류 필터 미적용
 * @param keyword  null 또는 공백이면 이름/소개/태그/학과 검색 미적용
 */
public record AdminClubSearchCondition(
        ClubStatus status,
        ClubCategory category,
        String division,
        String keyword
) {
}
