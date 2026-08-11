package com.duing.domain.club.service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * 추천순(RECOMMENDED) 정렬 정책 상수·산식의 단일 관리 지점.
 * <p>설계: docs/superpowers/specs/2026-08-11-club-explore-recommended-sort-design.md
 *
 * <pre>
 * ORDER BY statusPriority ASC, finalScore DESC, club.id ASC
 * finalScore = (clubShuffle*0.75 + categoryShuffle*0.25) * 0.7 + activityScore * 0.3
 * </pre>
 *
 * shuffle 은 KST 1시간 bucket 기반 deterministic random — 같은 시간대에는 페이지네이션이
 * 안정적이고, 시간이 바뀌면 노출 순서가 순환한다. categoryShuffle 은 시간대별로 특정
 * 카테고리를 상단에 유리하게 만드는 순환 성분으로, 카테고리 필터가 걸리면 결과 집합 안에서
 * 상수가 되어 자동으로 무효화된다.
 */
public final class ClubRecommendationPolicy {

    private ClubRecommendationPolicy() {
    }

    /** 모집중(OPEN) — 최상위 그룹. */
    public static final int PRIORITY_OPEN = 1;
    /** 상시모집(ALWAYS_OPEN). */
    public static final int PRIORITY_ALWAYS_OPEN = 2;
    /** 모집예정·모집마감·모집공고 없음 — 셋을 하나의 그룹으로 취급하며 내부 상태 우선순위를 두지 않는다. */
    public static final int PRIORITY_OTHERS = 3;

    // ── 그룹 내부 점수 결합 가중치 ──
    public static final double RANDOM_WEIGHT = 0.7;
    public static final double ACTIVITY_WEIGHT = 0.3;
    /** random 성분 내부: 동아리별 shuffle vs 카테고리 순환 shuffle 비중. */
    public static final double CLUB_SHUFFLE_WEIGHT = 0.75;
    public static final double CATEGORY_SHUFFLE_WEIGHT = 0.25;

    // ── activity_score 산식 가중치 (ClubMetric 배치가 사용) ──
    public static final double FAVORITE_WEIGHT = 0.4;
    public static final double APPLICATION_WEIGHT = 0.4;
    public static final double RECENCY_WEIGHT = 0.2;
    /** 최근 활동 보정 윈도우 — lastActivityAt 이 이보다 오래되면 recency 성분 0. */
    public static final int RECENCY_WINDOW_DAYS = 90;

    private static final DateTimeFormatter HOUR_BUCKET_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHH");

    /** KST 벽시계 → 1시간 bucket 문자열 (예: 2026-08-11 09:30 → "2026081109"). 호출부가 seoulClock 으로 now 를 만든다. */
    public static String hourBucket(LocalDateTime seoulNow) {
        return seoulNow.format(HOUR_BUCKET_FORMAT);
    }

    /**
     * 0~1 정규화 활동점수.
     * <p>로그 스케일 + 전체 최댓값 정규화 — raw count 합산 시 극단값(찜 100 vs 1)이
     * 나머지 신호를 압도하는 문제를 막는다. max 가 0 이면 해당 성분은 전체 0.
     */
    public static double activityScore(long favoriteCount, long maxFavoriteCount,
                                       long applicationCount, long maxApplicationCount,
                                       LocalDateTime lastActivityAt, LocalDateTime now) {
        double favoriteNorm = logNorm(favoriteCount, maxFavoriteCount);
        double applicationNorm = logNorm(applicationCount, maxApplicationCount);
        double recencyNorm = recencyNorm(lastActivityAt, now);
        return favoriteNorm * FAVORITE_WEIGHT
                + applicationNorm * APPLICATION_WEIGHT
                + recencyNorm * RECENCY_WEIGHT;
    }

    private static double logNorm(long count, long maxCount) {
        if (maxCount <= 0) {
            return 0;
        }
        return Math.log1p(count) / Math.log1p(maxCount);
    }

    private static double recencyNorm(LocalDateTime lastActivityAt, LocalDateTime now) {
        if (lastActivityAt == null) {
            return 0;
        }
        long daysSince = ChronoUnit.DAYS.between(lastActivityAt, now);
        if (daysSince <= 0) {
            return 1;
        }
        return Math.max(0, 1 - (double) daysSince / RECENCY_WINDOW_DAYS);
    }
}
