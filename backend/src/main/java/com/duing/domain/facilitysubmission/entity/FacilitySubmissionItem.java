package com.duing.domain.facilitysubmission.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Batch 에 완전 종속되는 제출 항목 — 자체 취소 상태를 갖지 않는다(스펙 §2).
 * batch.cancelledAt != null 이면 이 item 도 비활성으로 간주한다.
 * skippedAt 은 취소가 아니라 "완료 시 승인 상태가 아니어서 제출 대상에서 빠짐"이다 — 이력에는 계속 남지만
 * 예약을 더 이상 붙잡지 않아, 충돌 해소 후 재승인된 예약이 새 Batch 에 다시 담길 수 있다.
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

    @Column(name = "skipped_at")
    private LocalDateTime skippedAt;

    private FacilitySubmissionItem(Long batchId, Long bookingId) {
        this.batchId = batchId;
        this.bookingId = bookingId;
    }

    public static FacilitySubmissionItem of(Long batchId, Long bookingId) {
        return new FacilitySubmissionItem(batchId, bookingId);
    }

    /** 완료 시 제출 대상에서 제외 — 이력은 유지하되 예약에 대한 활성 제출 점유를 푼다. */
    public void markSkipped(LocalDateTime skippedAt) {
        this.skippedAt = skippedAt;
    }
}
