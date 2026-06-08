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
@Table(name = "interview_slot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_slot SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewSlot extends BaseEntity {

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    @Column(nullable = false)
    private int capacity;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSlot(Long recruitmentId, LocalDateTime startTime, LocalDateTime endTime, int capacity) {
        this.recruitmentId = recruitmentId;
        this.startTime = startTime;
        this.endTime = endTime;
        this.capacity = capacity;
    }

    public static InterviewSlot create(Long recruitmentId, LocalDateTime startTime, LocalDateTime endTime, int capacity) {
        return InterviewSlot.builder()
                .recruitmentId(recruitmentId)
                .startTime(startTime)
                .endTime(endTime)
                .capacity(capacity)
                .build();
    }

    public void updateTime(LocalDateTime newStartTime, LocalDateTime newEndTime) {
        this.startTime = newStartTime;
        this.endTime = newEndTime;
    }

    public void updateCapacity(int newCapacity) {
        if (newCapacity <= 0) {
            throw new InterviewException.CapacityBelowAssigned();
        }
        this.capacity = newCapacity;
    }
}
