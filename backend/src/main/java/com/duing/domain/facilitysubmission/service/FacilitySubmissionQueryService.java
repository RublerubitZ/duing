package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;

public interface FacilitySubmissionQueryService {

    SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query);
}
