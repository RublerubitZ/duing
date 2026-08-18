package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.FetchStatus;
import java.time.LocalDateTime;
import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * stale 플래그 판정 계약을 고정한다 — 소비자 3곳(이용현황·예약 가용성·관리자 상세)이 이 정의를 공유하므로,
 * 경계(정확히 TTL = 신선)나 무조건 stale 조건을 바꾸려면 이 테스트가 먼저 깨져야 한다.
 */
class SnapshotFreshnessPolicyTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 19, 12, 0);

    @Test
    @DisplayName("STALE_CACHE 폴백·미수집(crawledAt null)·비 SUCCESS(PARTIAL·FAILED)는 경과와 무관하게 stale 이다")
    void fallbackOrIncompleteSnapshotIsAlwaysStale() {
        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.STALE_CACHE, FetchStatus.SUCCESS, NOW,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isTrue();
        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.CACHE, FetchStatus.SUCCESS, null,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isTrue();
        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.CACHE, FetchStatus.PARTIAL, NOW,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isTrue();
        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.LIVE_FETCH, FetchStatus.FAILED, NOW,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isTrue();
    }

    @Test
    @DisplayName("정확히 TTL 만큼 경과한 스냅샷은 아직 신선하고, 그보다 지나면 stale 이다")
    void exactlyTtlIsFreshAndBeyondIsStale() {
        LocalDateTime crawledAtExactlyTtlAgo = NOW.minus(SnapshotFreshnessPolicy.CURRENT_NEXT_TTL);

        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.CACHE, FetchStatus.SUCCESS,
                crawledAtExactlyTtlAgo, SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isFalse();
        assertThat(SnapshotFreshnessPolicy.isStale(DataSource.CACHE, FetchStatus.SUCCESS,
                crawledAtExactlyTtlAgo.minusSeconds(1), SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, NOW)).isTrue();
    }

    @Test
    @DisplayName("월 의존 TTL 은 당월·익월 10분, 과거·먼 미래 월은 24시간이다")
    void ttlDependsOnMonthDistance() {
        YearMonth current = YearMonth.of(2026, 8);

        assertThat(SnapshotFreshnessPolicy.ttlFor(current, current))
                .isEqualTo(SnapshotFreshnessPolicy.CURRENT_NEXT_TTL);
        assertThat(SnapshotFreshnessPolicy.ttlFor(current.plusMonths(1), current))
                .isEqualTo(SnapshotFreshnessPolicy.CURRENT_NEXT_TTL);
        assertThat(SnapshotFreshnessPolicy.ttlFor(current.plusMonths(2), current))
                .isEqualTo(SnapshotFreshnessPolicy.OTHER_MONTH_TTL);
        assertThat(SnapshotFreshnessPolicy.ttlFor(current.minusMonths(1), current))
                .isEqualTo(SnapshotFreshnessPolicy.OTHER_MONTH_TTL);
    }
}
