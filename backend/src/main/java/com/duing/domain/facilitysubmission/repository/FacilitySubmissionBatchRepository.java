package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionBatchRepository
        extends JpaRepository<FacilitySubmissionBatch, Long>, FacilitySubmissionBatchRepositoryCustom {

    /** 완료/취소의 동시 실행 직렬화(§4.2·§4.3) — 상태 가드가 잠금 하에서 평가되도록 한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT batch FROM FacilitySubmissionBatch batch WHERE batch.id = :batchId")
    Optional<FacilitySubmissionBatch> findByIdForUpdate(@Param("batchId") Long batchId);
}
