package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionItemRepository extends JpaRepository<FacilitySubmissionItem, Long> {

    List<FacilitySubmissionItem> findByBatchIdOrderByIdAsc(Long batchId);

    /** 활성(미취소 batch 소속 · 완료 시 미제외) 제출의 bookingId→submissionNo — 후보 표시·중복 제출 검증 공용(§4·§5.1).
     *  완료 시 제외된 item 은 예약을 붙잡지 않으므로 후보 목록에서 다시 선택 가능해진다. */
    @Query("SELECT i.bookingId AS bookingId, b.submissionNo AS submissionNo "
            + "FROM FacilitySubmissionItem i JOIN FacilitySubmissionBatch b ON i.batchId = b.id "
            + "WHERE i.bookingId IN :bookingIds AND b.cancelledAt IS NULL AND i.skippedAt IS NULL")
    List<ActiveSubmissionProjection> findActiveByBookingIdIn(@Param("bookingIds") Collection<Long> bookingIds);

    /** 이력 행의 예약 건수(§5.3) — batch 별 집계. */
    @Query("SELECT i.batchId AS batchId, COUNT(i) AS bookingCount FROM FacilitySubmissionItem i "
            + "WHERE i.batchId IN :batchIds GROUP BY i.batchId")
    List<BatchItemCountProjection> countByBatchIdIn(@Param("batchIds") Collection<Long> batchIds);

    /** 배치별 포함 동아리(동아리 중심 보기 스펙 §2) — bookingCount 와 같은 전 item 기준(스킵 포함). */
    @Query("SELECT i.batchId AS batchId, fb.clubId AS clubId FROM FacilitySubmissionItem i "
            + "JOIN FacilityBooking fb ON i.bookingId = fb.id "
            + "WHERE i.batchId IN :batchIds GROUP BY i.batchId, fb.clubId")
    List<BatchClubProjection> findClubIdsByBatchIdIn(@Param("batchIds") Collection<Long> batchIds);

    interface ActiveSubmissionProjection {
        Long getBookingId();

        String getSubmissionNo();
    }

    interface BatchItemCountProjection {
        Long getBatchId();

        long getBookingCount();
    }

    interface BatchClubProjection {
        Long getBatchId();

        Long getClubId();
    }
}
