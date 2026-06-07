package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import java.util.List;

public interface ApplicationRepositoryCustom {

    /**
     * 운영진 지원자 목록 조회.
     * 정렬: createdAt DESC (최신 지원자가 위).
     * filter 의 모든 필드는 옵셔널 — null 이면 해당 조건 미적용.
     */
    List<Application> searchApplicants(Long recruitmentId, ApplicantSearchCondition condition);
}
