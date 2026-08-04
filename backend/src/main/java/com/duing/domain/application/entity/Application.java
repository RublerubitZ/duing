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
import jakarta.persistence.Version;
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
// @Version 도입 후 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달하므로
// WHERE 절에 version 조건을 명시한다. soft delete 도 OptimisticLock 적용 대상이 된다.
@SQLDelete(sql = "UPDATE application SET deleted_at = NOW() WHERE id = ? AND version = ?")
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
    private List<ApplicationAnswer> answers;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApplicationStatus status;

    // 두 운영진이 동시에 상태를 변경하면 후행 UPDATE 가 0 row affected →
    // ObjectOptimisticLockingFailureException 으로 차단된다. Hibernate 가 직접 채운다.
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private Application(Recruitment recruitment, User user, List<ApplicationAnswer> answers, ApplicationStatus status) {
        this.recruitment = recruitment;
        this.user = user;
        this.answers = answers;
        this.status = status;
    }

    public static Application submit(Recruitment recruitment, User user, List<ApplicationAnswer> answers) {
        // 답변 원소(ApplicationAnswer) 자체가 null 이면 방어적으로 제거한다. 원소 내부 values 의 null 항목은
        // 빈 문자열(무응답)로 정규화되는데, 그 정규화는 ApplicationAnswer 컴팩트 생성자가 담당한다.
        // @Size 컨테이너 제약은 null 을 유효로 간주하므로(Bean Validation 규약) DTO 검증만으로는 null 이
        // jsonb 에 저장되어 응답에 노출될 수 있다 — 빈 문자열("")은 이미 허용되는 "무응답"이므로 null 을
        // 그 정규형으로 수렴시킨다 (#604 null 정규화 의도 계승).
        List<ApplicationAnswer> sanitized = new ArrayList<>();
        if (answers != null) {
            for (ApplicationAnswer answer : answers) {
                if (answer != null) {
                    sanitized.add(answer);
                }
            }
        }
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
            case SUBMITTED -> to == ApplicationStatus.ON_HOLD
                    || to == ApplicationStatus.REJECTED
                    || (useInterview
                            ? to == ApplicationStatus.INTERVIEW_PENDING
                            : to == ApplicationStatus.ACCEPTED);
            case ON_HOLD -> to == ApplicationStatus.REJECTED
                    || (useInterview
                            ? to == ApplicationStatus.INTERVIEW_PENDING
                            : to == ApplicationStatus.ACCEPTED);
            case INTERVIEW_PENDING -> to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
            // UNDER_REVIEW 는 V97 치환 후 존재하지 않는 죽은 상태 — 상수와 함께 후속 작업에서 제거한다.
            case UNDER_REVIEW, ACCEPTED, REJECTED -> false;
        };
    }

    public List<ApplicationAnswer> getAnswers() {
        return Collections.unmodifiableList(answers);
    }
}
