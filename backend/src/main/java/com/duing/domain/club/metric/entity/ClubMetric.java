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
 * 추천순 정렬용 동아리 활동 지표 스냅샷.
 * <p>{@code ClubMetricRefreshJob} 이 매시 전체를 재계산해 덮어쓴다 — 도메인 이벤트로 증분 갱신하지 않는다.
 * 정렬은 {@link #activityScore} 만 사용하고 나머지 카운트는 재계산 원천값이다.
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

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt;

    private ClubMetric(Long clubId, int favoriteCount, int applicationCount,
                       LocalDateTime lastActivityAt, double activityScore, LocalDateTime computedAt) {
        this.clubId = clubId;
        this.favoriteCount = favoriteCount;
        this.applicationCount = applicationCount;
        this.lastActivityAt = lastActivityAt;
        this.activityScore = activityScore;
        this.computedAt = computedAt;
    }

    public static ClubMetric of(Long clubId, int favoriteCount, int applicationCount,
                                LocalDateTime lastActivityAt, double activityScore, LocalDateTime computedAt) {
        return new ClubMetric(clubId, favoriteCount, applicationCount, lastActivityAt, activityScore, computedAt);
    }
}
