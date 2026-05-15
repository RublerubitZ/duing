package com.duing.domain.application.entity;

import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.recruitment.entity.Recruitment;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(name = "application")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE application SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Application extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recruitment_id", nullable = false)
    private Recruitment recruitment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<String> answers;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApplicationStatus status;

    @Column(name = "interview_at")
    private LocalDateTime interviewAt;

    @Column(name = "interview_location", length = 200)
    private String interviewLocation;

    @Builder(access = AccessLevel.PRIVATE)
    private Application(Recruitment recruitment, User user, List<String> answers, ApplicationStatus status) {
        this.recruitment = recruitment;
        this.user = user;
        this.answers = answers;
        this.status = status;
    }

    public static Application submit(Recruitment recruitment, User user, List<String> answers) {
        List<String> sanitized = answers == null ? new ArrayList<>() : new ArrayList<>(answers);
        return Application.builder()
                .recruitment(recruitment)
                .user(user)
                .answers(sanitized)
                .status(ApplicationStatus.SUBMITTED)
                .build();
    }

    public void transitionTo(ApplicationStatus newStatus, boolean useInterview) {
        if (!isAllowedTransition(this.status, newStatus, useInterview)) {
            throw new ApplicationDomainException.InvalidStatusTransitionException();
        }
        this.status = newStatus;
    }

    private static boolean isAllowedTransition(ApplicationStatus from, ApplicationStatus to, boolean useInterview) {
        return switch (from) {
            case SUBMITTED -> to == ApplicationStatus.UNDER_REVIEW;
            case UNDER_REVIEW -> useInterview
                    ? to == ApplicationStatus.INTERVIEW_PENDING
                            || to == ApplicationStatus.REJECTED
                    : to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
            case INTERVIEW_PENDING -> to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
            case ACCEPTED, REJECTED -> false;
        };
    }

    public void scheduleInterview(LocalDateTime at, String location) {
        if (at == null) {
            throw new ApplicationDomainException.InvalidInterviewScheduleException();
        }
        if (location == null || location.isBlank()) {
            throw new ApplicationDomainException.InvalidInterviewScheduleException();
        }
        if (this.status != ApplicationStatus.INTERVIEW_PENDING) {
            throw new ApplicationDomainException.InvalidStatusTransitionException();
        }
        this.interviewAt = at;
        this.interviewLocation = location;
    }

    public List<String> getAnswers() {
        return Collections.unmodifiableList(answers);
    }
}
