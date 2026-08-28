package com.duing.domain.club.metric.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 추천순 정렬용 동아리 활동 지표 + 홈 관심도 스냅샷.
 * <p>{@code ClubMetricRefreshJob} 이 매시 전체를 재계산해 덮어쓴다 — 도메인 이벤트로 증분 갱신하지 않는다.
 * 정렬은 {@link #activityScore}(추천순)와 {@link #interestScore}(홈 관심도순)만 사용하고 나머지
 * 카운트는 재계산 원천값이거나 화면 표시용이다.
 * 행이 없는 동아리(배치 전 신규)는 정렬에서 0 점으로 취급되므로 생성 시점 시드가 필요 없다.
 * <p>자연키(club_id) PK 파생 스냅샷이라 BaseEntity(대리키·soft-delete·감사 컬럼)를 상속하지 않는다
 * — computed_at 이 갱신 시각을 겸한다(FacilitySubmissionSequence 선례).
 */
@Getter
@Entity
@Table(name = "club_metric")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClubMetric {

    @Id
    @Column(name = "club_id")
    private Long clubId;

    @Column(name = "favorite_count", nullable = false)
    private int favoriteCount;

    @Column(name = "application_count", nullable = false)
    private int applicationCount;

    @Column(name = "last_activity_at")
    private LocalDateTime lastActivityAt;

    /** 0~1 정규화 활동점수 — 산식은 ClubRecommendationPolicy.activityScore 참고. */
    @Column(name = "activity_score", nullable = false)
    private double activityScore;

    /**
     * 홈 관심도순 정렬 점수 — 최근 7일 일별 순방문자에 반감기 3일 감쇠를 적용한 합.
     * 산식은 ClubInterestPolicy 참고. 사용자에게 노출하지 않는 내부 정렬값이다.
     */
    @Column(name = "interest_score", nullable = false)
    private double interestScore;

    /** 최근 7일 순방문자 수 — 감쇠 없는 실제 사람 수로, 화면에 그대로 표시되는 유일한 관심도 값이다. */
    @Column(name = "weekly_visitor_count", nullable = false)
    private int weeklyVisitorCount;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt;

    private ClubMetric(Long clubId, int favoriteCount, int applicationCount,
                       LocalDateTime lastActivityAt, double activityScore,
                       double interestScore, int weeklyVisitorCount, LocalDateTime computedAt) {
        this.clubId = clubId;
        this.favoriteCount = favoriteCount;
        this.applicationCount = applicationCount;
        this.lastActivityAt = lastActivityAt;
        this.activityScore = activityScore;
        this.interestScore = interestScore;
        this.weeklyVisitorCount = weeklyVisitorCount;
        this.computedAt = computedAt;
    }

    public static ClubMetric of(Long clubId, int favoriteCount, int applicationCount,
                                LocalDateTime lastActivityAt, double activityScore,
                                double interestScore, int weeklyVisitorCount, LocalDateTime computedAt) {
        return new ClubMetric(clubId, favoriteCount, applicationCount, lastActivityAt,
                activityScore, interestScore, weeklyVisitorCount, computedAt);
    }
}
