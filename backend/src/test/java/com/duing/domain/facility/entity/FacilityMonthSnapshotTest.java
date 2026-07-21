package com.duing.domain.facility.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 크롤 실패 메타의 오류 문구 절단 규칙. 예외 메시지에는 크롤 원문(이모지 포함 가능)이 실릴 수 있어,
 * 절단점이 서로게이트 쌍을 쪼개면 고아 서로게이트가 남아 메타 기록 자체가 실패한다.
 */
class FacilityMonthSnapshotTest {

    private static final int MAX_ERROR_LENGTH = 500;
    private static final String EMOJI = "🎸";

    @Test
    @DisplayName("길이를 넘는 오류 문구는 절단되어 기록된다")
    void truncatesOverLengthError() {
        FacilityMonthSnapshot snapshot = FacilityMonthSnapshot.create(
                YearMonth.of(2026, 7), null, CrawlSource.SCHEDULER, FetchStatus.FAILED, "오".repeat(MAX_ERROR_LENGTH + 50));

        assertThat(snapshot.getLastError()).hasSize(MAX_ERROR_LENGTH);
    }

    @Test
    @DisplayName("오류 문구 절단점에 서로게이트 쌍이 걸리면 쌍을 쪼개지 않고 한 글자 앞에서 잘린다")
    void keepsSurrogatePairIntactInError() {
        String surrogateBoundaryError = "오".repeat(MAX_ERROR_LENGTH - 1) + EMOJI;

        FacilityMonthSnapshot snapshot = FacilityMonthSnapshot.create(
                YearMonth.of(2026, 7), null, CrawlSource.SCHEDULER, FetchStatus.FAILED, surrogateBoundaryError);

        String recordedError = snapshot.getLastError();
        assertThat(recordedError).hasSize(MAX_ERROR_LENGTH - 1);
        assertThat(Character.isSurrogate(recordedError.charAt(recordedError.length() - 1))).isFalse();
    }

    @Test
    @DisplayName("실패 기록 경로에서도 같은 절단 규칙이 적용된다")
    void keepsSurrogatePairIntactOnRecordFailure() {
        FacilityMonthSnapshot snapshot = FacilityMonthSnapshot.create(
                YearMonth.of(2026, 7), null, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);

        snapshot.recordFailure(CrawlSource.ON_DEMAND, "오".repeat(MAX_ERROR_LENGTH - 1) + EMOJI);

        String recordedError = snapshot.getLastError();
        assertThat(recordedError).hasSize(MAX_ERROR_LENGTH - 1);
        assertThat(Character.isSurrogate(recordedError.charAt(recordedError.length() - 1))).isFalse();
    }
}
