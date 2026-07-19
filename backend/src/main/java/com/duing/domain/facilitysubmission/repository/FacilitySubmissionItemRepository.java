package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionItemRepository extends JpaRepository<FacilitySubmissionItem, Long> {

    List<FacilitySubmissionItem> findByBatchIdOrderByIdAsc(Long batchId);

    /** 활성(미취소 batch 소속) 제출의 bookingId→submissionNo — 후보 표시·중복 제출 검증 공용(§4·§5.1). */
    @Query("SELECT i.bookingId AS bookingId, b.submissionNo AS submissionNo "
            + "FROM FacilitySubmissionItem i JOIN FacilitySubmissionBatch b ON i.batchId = b.id "
            + "WHERE i.bookingId IN :bookingIds AND b.cancelledAt IS NULL")
    List<ActiveSubmissionProjection> findActiveByBookingIdIn(@Param("bookingIds") Collection<Long> bookingIds);

    /** 이력 행의 예약 건수(§5.3) — batch 별 집계. */
    @Query("SELECT i.batchId AS batchId, COUNT(i) AS bookingCount FROM FacilitySubmissionItem i "
            + "WHERE i.batchId IN :batchIds GROUP BY i.batchId")
    List<BatchItemCountProjection> countByBatchIdIn(@Param("batchIds") Collection<Long> batchIds);

    interface ActiveSubmissionProjection {
        Long getBookingId();

        String getSubmissionNo();
    }

    interface BatchItemCountProjection {
        Long getBatchId();

        long getBookingCount();
    }
}
