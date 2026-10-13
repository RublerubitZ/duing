package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentListItem;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import java.util.List;

public interface AdminRecruitmentQueryService {

    /** 총동연 모집 목록 — 전 동아리 대상. 삭제된 모집은 조회되지 않는다. 행마다 미처리 지원서·운영진 접속을 얹는다. */
    List<AdminRecruitmentListItem> search(AdminRecruitmentSearchCondition searchCondition);

    /** 총동연 모집 상세. 삭제된 모집은 조회되지 않아 404 로 수렴한다. */
    AdminRecruitmentDetailQuery getDetail(Long recruitmentId);
}
