package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.fee.service.GeneralBankTransactionSyncService.SyncWindow;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class GeneralBankTransactionSyncServiceWindowTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);

    @Test
    @DisplayName("저장된 거래가 없으면(첫 동기화) 오늘 14일 전부터 조회하고 빠진 기간은 없다")
    void firstSyncStartsAtLookback() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, null, null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 17), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 20일 전이면 그 전날부터 조회해 쉰 기간을 메운다")
    void idleGapStartsDayBeforeLatest() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 9, 11), null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 10), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 30일 전이면 상한(오늘 포함 31일)인 그날부터 조회하고 빠진 기간은 없다")
    void latestAtCapStartsAtCapWithoutMissedRange() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 9, 1), null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 2일 전이어도 14일 전부터 다시 조회해 계좌를 바꾼 뒤 새 계좌의 앞선 입금을 받는다")
    void recentLatestStillRefetchesLookback() {
        // 수정 전 시작일 10-31
        assertThat(GeneralBankTransactionSyncService.resolveWindow(LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 1), null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 10, 20), null, null));
    }

    @Test
    @DisplayName("마지막 거래일이 상한보다 앞이면 최근 31일만 조회하고 마지막 거래일부터 조회 시작 전날까지를 빠진 기간으로 돌려준다")
    void latestBeforeCapReportsMissedRange() {
        // 수정 전 시작일 09-17(두 경우 모두)
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 8, 16), null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 16), LocalDate.of(2026, 8, 31)));
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 8, 31), null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 31), LocalDate.of(2026, 8, 31)));
    }

    // 스펙 3-5 의 표 여덟 줄 그대로(오늘 10/1). 3·4·5번째 줄이 바뀐 동작이고, 8번째 줄은 마지막 거래가 늦어 지금과 같다.
    @ParameterizedTest(name = "[{index}] 마지막 거래 {0} · 마지막 동기화 {1} → 조회 시작 {2} · 못 본 기간 {3}~{4}")
    @CsvSource(value = {
            "NULL,       NULL,       2026-09-17, NULL,       NULL",
            "2026-08-01, NULL,       2026-09-01, 2026-08-01, 2026-08-31",
            "2026-08-01, 2026-09-28, 2026-09-17, NULL,       NULL",
            "2026-08-01, 2026-09-05, 2026-09-04, NULL,       NULL",
            "2026-08-01, 2026-08-20, 2026-09-01, 2026-08-20, 2026-08-31",
            "2026-09-29, 2026-09-29, 2026-09-17, NULL,       NULL",
            "2026-09-11, NULL,       2026-09-10, NULL,       NULL",
            "2026-09-29, 2026-09-05, 2026-09-17, NULL,       NULL",
    }, nullValues = "NULL")
    @DisplayName("마지막 거래일과 마지막 동기화일 가운데 늦은 날까지 조회했다고 보고 조회 시작일과 못 본 기간을 정한다")
    void windowUsesLaterOfLatestTransactionAndLastSync(LocalDate latestTransactionDate, LocalDate lastSyncedDate,
                                                       LocalDate expectedStart, LocalDate expectedMissedFrom,
                                                       LocalDate expectedMissedTo) {
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, latestTransactionDate, lastSyncedDate))
                .isEqualTo(new SyncWindow(expectedStart, expectedMissedFrom, expectedMissedTo));
    }
}
