package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;

public interface AdminUserQueryService {

    /** 총동연 회원 상세. 탈퇴(soft-delete)한 회원은 조회되지 않아 404 로 수렴한다. */
    AdminUserDetailQuery getDetail(Long userId);
}
