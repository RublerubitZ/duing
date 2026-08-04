package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;

/**
 * 관리자 모집 목록 검색 조건. 모든 필드 옵셔널이며 널이면 해당 조건을 적용하지 않는다.
 *
 * <p>{@code q} 는 동아리명·모집 제목 부분일치(OR, 대소문자 무시), {@code status} 는 저장 상태
 * (기간 경과 여부가 아니라 OPEN/CLOSED 그대로), {@code mode} 는 모집 방식이다.
 */
public record AdminRecruitmentSearchCondition(
        String q,
        RecruitmentStatus status,
        ApplicationMode mode,
        AdminRecruitmentSort sort
) {
    public AdminRecruitmentSearchCondition {
        // 정렬 생략은 최신순으로 수렴시킨다 — 컨트롤러 기본값과 별개로 조건 객체 자체가 정렬을 항상 갖는다.
        sort = sort == null ? AdminRecruitmentSort.LATEST : sort;
    }
}
