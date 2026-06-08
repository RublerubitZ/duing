package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "interview_schedule")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_schedule SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewSchedule extends BaseEntity {

    @Column(name = "application_id", nullable = false, unique = true)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InterviewScheduleStatus status;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSchedule(Long applicationId, Long slotId, Long recruitmentId,
                               InterviewScheduleStatus status, LocalDateTime assignedAt) {
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.recruitmentId = recruitmentId;
        this.status = status;
        this.assignedAt = assignedAt;
    }

    public static InterviewSchedule create(Long applicationId, Long slotId, Long recruitmentId,
                                            LocalDateTime assignedAt) {
        return InterviewSchedule.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .recruitmentId(recruitmentId)
                .status(InterviewScheduleStatus.ASSIGNED)
                .assignedAt(assignedAt)
                .build();
    }

    public void reassign(Long newSlotId, LocalDateTime newAssignedAt) {
        this.slotId = newSlotId;
        this.status = InterviewScheduleStatus.ASSIGNED;
        this.assignedAt = newAssignedAt;
    }

    public void cancel() {
        this.status = InterviewScheduleStatus.CANCELLED;
    }
}
