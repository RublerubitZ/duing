package com.duing.domain.application.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.command.UpdateInterviewCommand;
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

    List<ApplicationSummaryQuery> getMyApplications(Long userId, Set<ApplicationStatus> statuses);

    MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId);

    List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition);

    ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId);

    void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand);

    BulkUpdateApplicationStatusResult bulkUpdateStatus(BulkUpdateApplicationStatusCommand bulkCommand);

    void updateInterview(UpdateInterviewCommand updateInterviewCommand);

    ApplicantNeighborsQuery getNeighbors(Long recruitmentId, Long applicationId, Long currentUserId,
                                         ApplicantSearchCondition condition);
}
