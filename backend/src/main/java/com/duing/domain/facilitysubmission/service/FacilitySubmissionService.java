package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;

public interface FacilitySubmissionService {

    CreateSubmissionBatchResult create(CreateSubmissionBatchCommand command, SubmissionActorContext actor);

    void cancel(Long batchId, SubmissionActorContext actor);
}
