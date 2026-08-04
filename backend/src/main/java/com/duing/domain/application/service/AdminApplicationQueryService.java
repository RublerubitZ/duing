package com.duing.domain.application.service;

import com.duing.domain.application.service.dto.query.AdminApplicantListQuery;
import com.duing.domain.application.service.dto.query.AdminApplicantSort;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;

public interface AdminApplicationQueryService {

    /**
     * 총동연 지원자 목록. 외부 폼 모집은 두잉에 지원 데이터가 없어 자연히 빈 목록이 나온다(오류 아님).
     */
    AdminApplicantListQuery getApplicants(Long recruitmentId, ApplicantSearchCondition condition,
                                          AdminApplicantSort sort);

    /**
     * 총동연 지원서 상세. 개인정보 열람이라 조회 자체가 감사 이벤트를 남기는 쓰기 작업이다.
     * 취소된 지원서는 조회되지 않아 404 로 수렴한다.
     */
    ApplicantDetailQuery getApplicationDetail(Long applicationId, Long adminUserId);
}
