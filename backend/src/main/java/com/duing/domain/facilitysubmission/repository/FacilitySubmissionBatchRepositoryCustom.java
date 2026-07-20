package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FacilitySubmissionBatchRepositoryCustom {

    Page<FacilitySubmissionBatch> search(SubmissionBatchSearchCondition condition, Pageable pageable);
}
