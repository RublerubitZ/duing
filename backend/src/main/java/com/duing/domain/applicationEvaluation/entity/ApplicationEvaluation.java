package com.duing.domain.applicationEvaluation.entity;

import com.duing.domain.application.entity.Application;
import com.duing.domain.applicationEvaluation.exception.ApplicationEvaluationDomainException;
import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "application_evaluation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE application_evaluation SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ApplicationEvaluation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "evaluator_id", nullable = false)
    private User evaluator;

    @Column(nullable = false)
    private Integer score;

    @Column(columnDefinition = "TEXT")
    private String memo;

    @Builder(access = AccessLevel.PRIVATE)
    private ApplicationEvaluation(Application application, User evaluator, int score, String memo) {
        this.application = application;
        this.evaluator = evaluator;
        this.score = score;
        this.memo = memo;
    }

    public static ApplicationEvaluation create(Application application, User evaluator, int score, String memo) {
        validateScore(score);
        return ApplicationEvaluation.builder()
                .application(application)
                .evaluator(evaluator)
                .score(score)
                .memo(memo)
                .build();
    }

    public void update(int score, String memo) {
        validateScore(score);
        this.score = score;
        this.memo = memo;
    }

    private static void validateScore(int score) {
        if (score < 1 || score > 5) {
            throw new ApplicationEvaluationDomainException.EvaluationScoreOutOfRangeException();
        }
    }
}
