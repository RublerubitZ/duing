package com.duing.domain.application.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.application.service.dto.query.BulkUpdateApplicationStatusResult;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import java.util.List;
import java.util.Set;

public interface ApplicationService {

    Long submit(SubmitApplicationCommand submitApplicationCommand);

    /**
     * 제출 없이 지원 가능 여부만 사전 확인한다. submit 과 동일한 가드 체인
     * (모집 존재 → 동아리 ACTIVE → 마감 → 외부폼 → 사용자 존재 → 중복 지원 → 회원 자격)을
     * 단일 공용 메서드로 공유하므로, 부적격 시 submit 과 동일한 예외·상태코드·메시지가 발생한다.
     */
    void checkEligibility(Long userId, Long recruitmentId);

    List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses);

    MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId);

    void withdraw(Long applicationId, Long currentUserId);

    List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition);

    ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId);

    /** 지원자 원본 연락처 — 열람마다 APPLICANT_PHONE_VIEWED 감사 행을 남긴다. 비운영진은 거부, 없는 지원서는 404. */
    String getApplicantPhone(Long applicationId, Long currentUserId);

    void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand);

    BulkUpdateApplicationStatusResult bulkUpdateStatus(BulkUpdateApplicationStatusCommand bulkCommand);

    ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId,
                                         ApplicantSearchCondition condition);

    void rejectActiveOnClubClosure(List<Long> recruitmentIds, Long actorAdminUserId);

    /**
     * 운영 중단 동아리 남은 미결 정리(스펙 §4-1) — 그 동아리의 삭제되지 않은 모집(마감 포함)의 결과 미정 지원서를 모두
     * 불합격으로 바꾸고 운영 중단 표시를 남긴다. 호출자가 동아리 행을 잠근 뒤 부른다. 처리 건수를 돌려준다.
     */
    int rejectActiveOnClubDeactivation(Long clubId, Long actorAdminUserId);
}
