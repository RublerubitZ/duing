package com.duing.domain.interview.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_availability")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_availability SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewAvailability extends BaseEntity {

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewAvailability(Long applicationId, Long slotId, Long recruitmentId) {
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.recruitmentId = recruitmentId;
    }

    public static InterviewAvailability create(Long applicationId, Long slotId, Long recruitmentId) {
        return InterviewAvailability.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .recruitmentId(recruitmentId)
                .build();
    }
}
