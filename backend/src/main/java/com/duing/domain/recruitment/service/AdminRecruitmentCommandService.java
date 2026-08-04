package com.duing.domain.recruitment.service;

public interface AdminRecruitmentCommandService {

    /**
     * 총동연 강제 마감. 운영진 수동 마감과 같은 도메인 전이를 타므로 이미 마감된 모집은 409 다.
     * 사유는 선택 입력이며 감사 이벤트에만 기록된다.
     */
    void forceClose(Long recruitmentId, Long adminUserId, String reason);
}
