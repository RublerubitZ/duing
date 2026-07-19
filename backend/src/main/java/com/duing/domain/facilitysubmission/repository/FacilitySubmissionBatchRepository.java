package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilitySubmissionBatchRepository extends JpaRepository<FacilitySubmissionBatch, Long> {

    /** 제출 이력(§5.3) — 취소 포함 최신순. id 내림차순 = 생성 역순(결정적 정렬). */
    Page<FacilitySubmissionBatch> findAllByOrderByIdDesc(Pageable pageable);

    Page<FacilitySubmissionBatch> findByFacilityIdOrderByIdDesc(Long facilityId, Pageable pageable);
}
