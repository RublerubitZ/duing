package com.duing.domain.facilitysubmission.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Batch 에 완전 종속되는 제출 항목 — 자체 취소 상태를 갖지 않는다(스펙 §2).
 * batch.cancelledAt != null 이면 이 item 도 비활성으로 간주한다.
 */
@Getter
@Entity
@Table(name = "facility_submission_item")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionItem extends BaseEntity {

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    private FacilitySubmissionItem(Long batchId, Long bookingId) {
        this.batchId = batchId;
        this.bookingId = bookingId;
    }

    public static FacilitySubmissionItem of(Long batchId, Long bookingId) {
        return new FacilitySubmissionItem(batchId, bookingId);
    }
}
