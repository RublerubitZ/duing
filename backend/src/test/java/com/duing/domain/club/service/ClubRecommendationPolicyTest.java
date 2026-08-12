package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.duing.domain.club.support.RecommendedScoreTestSupport;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubRecommendationPolicyTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @Test
    @DisplayName("hour bucket 은 yyyyMMddHH 형식으로 같은 시각대(59분까지)에는 같은 값을 낸다")
    void hourBucketFormatsWallClockHour() {
        assertThat(ClubRecommendationPolicy.hourBucket(LocalDateTime.of(2026, 8, 11, 9, 0)))
                .isEqualTo("2026081109");
        assertThat(ClubRecommendationPolicy.hourBucket(LocalDateTime.of(2026, 8, 11, 9, 59)))
                .isEqualTo("2026081109");
        assertThat(ClubRecommendationPolicy.hourBucket(LocalDateTime.of(2026, 8, 11, 10, 0)))
                .isEqualTo("2026081110");
    }

    @Test
    @DisplayName("UTC 와 날짜가 갈리는 KST 자정 직후에도 bucket 은 KST 벽시계 기준으로 계산된다")
    void hourBucketUsesKstWallClockAcrossUtcDateBoundary() {
        // 2026-08-10T15:30Z == 2026-08-11 00:30 KST — UTC 로 계산하면 2026081015 로 어긋난다.
        Clock kstMidnightAfter = Clock.fixed(Instant.parse("2026-08-10T15:30:00Z"), SEOUL);
        String bucket = ClubRecommendationPolicy.hourBucket(LocalDateTime.now(kstMidnightAfter));
        assertThat(bucket).isEqualTo("2026081100");
    }

    @Test
    @DisplayName("카테고리 순환 — 시간 bucket 이 지남에 따라 우세 카테고리가 서로 뒤바뀐다")
    void categoryRotationAlternatesDominantCategoryAcrossBuckets() {
        // 고정된 100시간 구간에서 두 카테고리의 셔플 우위가 양쪽 모두 발생해야 순환이다.
        // md5 결정적 산식이라 재현 가능(절대 날짜여도 만료 의미가 없어 timebomb 아님).
        LocalDateTime base = LocalDateTime.of(2026, 8, 11, 0, 0);
        int academicWins = 0;
        int sportsWins = 0;
        for (int hourOffset = 0; hourOffset < 100; hourOffset++) {
            String bucket = ClubRecommendationPolicy.hourBucket(base.plusHours(hourOffset));
            double academic = RecommendedScoreTestSupport.shuffleScore("ACADEMIC", bucket);
            double sports = RecommendedScoreTestSupport.shuffleScore("SPORTS", bucket);
            if (academic > sports) {
                academicWins++;
            } else {
                sportsWins++;
            }
        }
        assertThat(academicWins).isGreaterThan(0);
        assertThat(sportsWins).isGreaterThan(0);
    }

    @Test
    @DisplayName("모든 신호가 최대이면 활동점수는 1.0, 신호가 전혀 없으면 0 이다")
    void activityScoreIsBoundedZeroToOne() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 9, 0);
        assertThat(ClubRecommendationPolicy.activityScore(10, 10, 5, 5, now, now))
                .isCloseTo(1.0, within(1e-9));
        assertThat(ClubRecommendationPolicy.activityScore(0, 10, 0, 5, null, now))
                .isCloseTo(0.0, within(1e-9));
    }

    @Test
    @DisplayName("전체 최댓값이 0 인 성분은 0 으로 처리되어 0 나눗셈이 없다")
    void zeroMaxComponentsContributeNothing() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 9, 0);
        assertThat(ClubRecommendationPolicy.activityScore(0, 0, 0, 0, null, now)).isZero();
    }

    @Test
    @DisplayName("찜 100개 동아리도 찜 성분 가중치(0.4)를 넘지 못한다 — raw count 합산이 아닌 정규화")
    void extremeFavoriteCountCannotOverwhelm() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 9, 0);
        double extremeFavoriteOnly = ClubRecommendationPolicy.activityScore(100, 100, 0, 0, null, now);
        assertThat(extremeFavoriteOnly).isCloseTo(ClubRecommendationPolicy.FAVORITE_WEIGHT, within(1e-9));
    }

    @Test
    @DisplayName("로그 스케일 — 찜 1개(최대 100) 동아리도 0 이 아닌 점수를 받아 완전히 묻히지 않는다")
    void logScaleKeepsSmallCountsVisible() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 9, 0);
        double single = ClubRecommendationPolicy.activityScore(1, 100, 0, 0, null, now);
        double expected = ClubRecommendationPolicy.FAVORITE_WEIGHT * (Math.log1p(1) / Math.log1p(100));
        assertThat(single).isCloseTo(expected, within(1e-9)).isGreaterThan(0);
    }

    @Test
    @DisplayName("recency 성분 — 방금 활동 1.0, 윈도우 절반(45일) 0.5, 윈도우(90일) 밖 0 으로 선형 감쇠한다")
    void recencyDecaysLinearlyOverWindow() {
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 9, 0);
        double fresh = ClubRecommendationPolicy.activityScore(0, 0, 0, 0, now, now);
        double halfWindow = ClubRecommendationPolicy.activityScore(0, 0, 0, 0, now.minusDays(45), now);
        double expired = ClubRecommendationPolicy.activityScore(0, 0, 0, 0, now.minusDays(100), now);
        assertThat(fresh).isCloseTo(ClubRecommendationPolicy.RECENCY_WEIGHT, within(1e-9));
        assertThat(halfWindow).isCloseTo(ClubRecommendationPolicy.RECENCY_WEIGHT * 0.5, within(1e-9));
        assertThat(expired).isZero();
    }
}
