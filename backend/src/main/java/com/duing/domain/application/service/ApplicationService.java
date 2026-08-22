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

    void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand);

    BulkUpdateApplicationStatusResult bulkUpdateStatus(BulkUpdateApplicationStatusCommand bulkCommand);

    ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId,
                                         ApplicantSearchCondition condition);

    void rejectActiveOnClubClosure(List<Long> recruitmentIds, Long actorAdminUserId);
}
