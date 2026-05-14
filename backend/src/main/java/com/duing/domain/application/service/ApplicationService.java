package com.duing.domain.application.service;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import java.util.List;

public interface ApplicationService {

    Long submit(SubmitApplicationCommand submitApplicationCommand);

    List<ApplicationSummaryQuery> getMyApplications(Long userId);

    List<ApplicantQuery> getApplicants(Long recruitmentId, Long currentUserId);

    void updateStatus(UpdateApplicationStatusCommand updateApplicationStatusCommand);
}
