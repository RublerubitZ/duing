package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilitySubmissionAuditRepository extends JpaRepository<FacilitySubmissionAudit, Long> {

    List<FacilitySubmissionAudit> findByBatchIdOrderByIdAsc(Long batchId);
}
