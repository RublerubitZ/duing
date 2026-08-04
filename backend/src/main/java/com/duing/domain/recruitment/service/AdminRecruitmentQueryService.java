package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import java.util.List;

public interface AdminRecruitmentQueryService {

    /** 총동연 모집 목록 — 전 동아리 대상. 삭제된 모집은 조회되지 않는다. */
    List<AdminRecruitmentRow> search(AdminRecruitmentSearchCondition searchCondition);

    /** 총동연 모집 상세. 삭제된 모집은 조회되지 않아 404 로 수렴한다. */
    AdminRecruitmentDetailQuery getDetail(Long recruitmentId);
}
