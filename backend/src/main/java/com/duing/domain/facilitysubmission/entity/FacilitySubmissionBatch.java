package com.duing.domain.facilitysubmission.entity;

import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 학교 제출 Batch. booking·facility·user 는 ID 스칼라 참조(facility 도메인 컨벤션).
 * cancelled_at 은 soft delete 가 아니라 비즈니스 상태 — 취소된 Batch 도 이력에 계속 표시되므로
 * @SQLRestriction 을 걸지 않는다(스펙 §2). deleted_at 은 BaseEntity 일관성으로만 존재, 항상 NULL.
 */
@Getter
@Entity
@Table(name = "facility_submission_batch")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionBatch extends BaseEntity {

    @Column(name = "submission_no", nullable = false, length = 20)
    private String submissionNo;

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "submitted_by", nullable = false)
    private Long submittedById;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @Column(length = 500)
    private String memo;

    @Column(name = "csv_file_name", nullable = false, length = 100)
    private String csvFileName;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancelled_by")
    private Long cancelledById;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilitySubmissionBatch(String submissionNo, Long facilityId, Long submittedById,
                                    LocalDateTime submittedAt, String memo, String csvFileName) {
        this.submissionNo = submissionNo;
        this.facilityId = facilityId;
        this.submittedById = submittedById;
        this.submittedAt = submittedAt;
        this.memo = memo;
        this.csvFileName = csvFileName;
    }

    public static FacilitySubmissionBatch create(String submissionNo, Long facilityId, Long submittedById,
                                                 LocalDateTime submittedAt, String memo) {
        return FacilitySubmissionBatch.builder()
                .submissionNo(submissionNo)
                .facilityId(facilityId)
                .submittedById(submittedById)
                .submittedAt(submittedAt)
                .memo(memo)
                .csvFileName("facility-submission-" + submissionNo + ".csv")
                .build();
    }

    /** 제출 취소(§4) — booking·item 은 건드리지 않는다. 활성 판정은 이 필드 하나로 파생된다. */
    public void cancel(Long adminId, LocalDateTime cancelledAt) {
        if (isCancelled()) {
            throw new FacilitySubmissionException.BatchAlreadyCancelledException();
        }
        this.cancelledAt = cancelledAt;
        this.cancelledById = adminId;
    }

    public boolean isCancelled() {
        return cancelledAt != null;
    }
}
