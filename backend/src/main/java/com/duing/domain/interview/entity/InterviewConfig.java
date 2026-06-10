package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_config")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_config SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewConfig extends BaseEntity {

    @Column(name = "recruitment_id", nullable = false, unique = true)
    private Long recruitmentId;

    @Column(name = "availability_deadline", nullable = false)
    private LocalDateTime availabilityDeadline;

    @Column(name = "assignment_completed_at")
    private LocalDateTime assignmentCompletedAt;

    @Column(length = 200)
    private String location;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewConfig(Long recruitmentId, LocalDateTime availabilityDeadline, String location) {
        this.recruitmentId = recruitmentId;
        this.availabilityDeadline = availabilityDeadline;
        this.location = location;
    }

    public static InterviewConfig create(Long recruitmentId, LocalDateTime availabilityDeadline) {
        return create(recruitmentId, availabilityDeadline, null);
    }

    public static InterviewConfig create(Long recruitmentId,
                                         LocalDateTime availabilityDeadline,
                                         String location) {
        String normalizedLocation = null;
        if (location != null) {
            String trimmed = location.trim();
            if (!trimmed.isEmpty()) {
                normalizedLocation = trimmed;
            }
        }
        return InterviewConfig.builder()
                .recruitmentId(recruitmentId)
                .availabilityDeadline(availabilityDeadline)
                .location(normalizedLocation)
                .build();
    }

    public void updateLocation(String newLocation) {
        if (newLocation == null) {
            return;
        }
        String trimmed = newLocation.trim();
        if (trimmed.isEmpty()) {
            return;
        }
        this.location = trimmed;
    }

    public boolean isAvailabilitySubmissionAllowed(LocalDateTime now) {
        return now.isBefore(availabilityDeadline);
    }

    public boolean isAutoAssignable(LocalDateTime now) {
        return !now.isBefore(availabilityDeadline) && assignmentCompletedAt == null;
    }

    public void updateDeadline(LocalDateTime newDeadline, LocalDateTime now) {
        if (!now.isBefore(availabilityDeadline)) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }
        this.availabilityDeadline = newDeadline;
    }

    public void markAssignmentCompleted(LocalDateTime now) {
        if (assignmentCompletedAt != null) {
            throw new InterviewException.AssignmentAlreadyCompleted();
        }
        this.assignmentCompletedAt = now;
    }

    /**
     * 슬롯을 신규로 생성할 수 있는지 판정한다.
     * <p>
     * 현재 로직은 {@code assignmentCompletedAt} 유무만 판단하므로 {@code now} 를 사용하지 않으나,
     * 동일 도메인의 {@link #canModifySlot}, {@link #canDeleteSlot} 와 시그니처를 일관시키고
     * 향후 phase 2 내부 추가 분기 (예: deadline + grace period) 도입 시 호환되도록 인자에 포함한다.
     */
    public boolean canCreateSlot(LocalDateTime now) {
        return assignmentCompletedAt == null;
    }

    public SlotMutableFields canModifySlot(int availabilityCount, LocalDateTime now) {
        if (assignmentCompletedAt != null) {
            return SlotMutableFields.NONE;
        }
        boolean selected = availabilityCount > 0;
        if (now.isBefore(availabilityDeadline)) {
            return selected ? SlotMutableFields.CAPACITY_ONLY : SlotMutableFields.TIME_AND_CAPACITY;
        }
        return selected ? SlotMutableFields.NONE : SlotMutableFields.TIME_AND_CAPACITY;
    }

    /**
     * 슬롯을 삭제할 수 있는지 판정한다.
     * <p>
     * 현재 로직은 {@code assignmentCompletedAt} 와 {@code availabilityCount} 만 판단하므로
     * {@code now} 를 사용하지 않으나, 동일 도메인의 {@link #canCreateSlot}, {@link #canModifySlot} 와
     * 시그니처를 일관시키고 향후 phase 별 추가 분기 (예: 자동배정 직전 lock 윈도우) 도입 시
     * 호환되도록 인자에 포함한다.
     */
    public boolean canDeleteSlot(int availabilityCount, LocalDateTime now) {
        if (assignmentCompletedAt != null) {
            return false;
        }
        return availabilityCount == 0;
    }

    /**
     * 현재 슬롯 lifecycle phase 를 반환한다.
     * <p>
     * {@code now} 는 도메인 내부에서 {@link LocalDateTime#now()} 를 호출하지 않고
     * 호출자(서비스 레이어) 가 주입한다 — 결정성·테스트 용이성 보존.
     */
    public SlotLifecyclePhase phase(LocalDateTime now) {
        if (assignmentCompletedAt != null) {
            return SlotLifecyclePhase.AFTER_ASSIGNMENT;
        }
        if (now.isBefore(availabilityDeadline)) {
            return SlotLifecyclePhase.BEFORE_DEADLINE;
        }
        return SlotLifecyclePhase.AFTER_DEADLINE_BEFORE_ASSIGNMENT;
    }

    public enum SlotMutableFields {
        NONE,
        CAPACITY_ONLY,
        TIME_AND_CAPACITY
    }
}
