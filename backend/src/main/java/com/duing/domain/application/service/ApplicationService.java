package com.duing.domain.application.service;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.application.service.dto.query.MyApplicationDetailQuery;
import java.util.List;

public interface ApplicationService {

    Long submit(SubmitApplicationCommand submitApplicationCommand);

    List<ApplicationSummaryQuery> getMyApplications(Long userId);

    MyApplicationDetailQuery getMyApplicationDetail(Long applicationId, Long currentUserId);

    List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId);

    ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId);

    void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand);
}
