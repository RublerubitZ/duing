package com.duing.domain.application.entity;

import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 지원서 상태 전이 audit log. append-only — 의도적으로 @SQLDelete / @SQLRestriction 없음.
 * hard delete 도 금지: Repository 에 delete API 미노출로 보장.
 * deleted_at 컬럼은 BaseEntity 일관성 때문에 따라오지만 항상 NULL.
 */
@Entity
@Table(name = "application_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationStatusHistory extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, length = 20)
    private ApplicationStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 20)
    private ApplicationStatus newStatus;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false)
    private User changedBy;

    @Builder(access = AccessLevel.PRIVATE)
    private ApplicationStatusHistory(Application application,
                                     ApplicationStatus previousStatus,
                                     ApplicationStatus newStatus,
                                     User changedBy) {
        this.application = application;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.changedBy = changedBy;
    }

    public static ApplicationStatusHistory record(Application application,
                                                  ApplicationStatus previousStatus,
                                                  ApplicationStatus newStatus,
                                                  User changedBy) {
        return ApplicationStatusHistory.builder()
                .application(application)
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedBy(changedBy)
                .build();
    }
}
