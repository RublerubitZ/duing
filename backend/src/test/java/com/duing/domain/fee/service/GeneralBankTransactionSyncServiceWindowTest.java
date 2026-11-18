package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.fee.service.GeneralBankTransactionSyncService.SyncWindow;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GeneralBankTransactionSyncServiceWindowTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);

    @Test
    @DisplayName("저장된 거래가 없으면(첫 동기화) 오늘 14일 전부터 조회하고 빠진 기간은 없다")
    void firstSyncStartsAtLookback() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, null))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 17), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 20일 전이면 그 전날부터 조회해 쉰 기간을 메운다")
    void idleGapStartsDayBeforeLatest() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 9, 11)))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 10), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 30일 전이면 상한(오늘 포함 31일)인 그날부터 조회하고 빠진 기간은 없다")
    void latestAtCapStartsAtCapWithoutMissedRange() {
        // 수정 전 시작일 09-17
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 9, 1)))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), null, null));
    }

    @Test
    @DisplayName("마지막 거래가 2일 전이어도 14일 전부터 다시 조회해 계좌를 바꾼 뒤 새 계좌의 앞선 입금을 받는다")
    void recentLatestStillRefetchesLookback() {
        // 수정 전 시작일 10-31
        assertThat(GeneralBankTransactionSyncService.resolveWindow(LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 1)))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 10, 20), null, null));
    }

    @Test
    @DisplayName("마지막 거래일이 상한보다 앞이면 최근 31일만 조회하고 마지막 거래일부터 조회 시작 전날까지를 빠진 기간으로 돌려준다")
    void latestBeforeCapReportsMissedRange() {
        // 수정 전 시작일 09-17(두 경우 모두)
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 8, 16)))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 16), LocalDate.of(2026, 8, 31)));
        assertThat(GeneralBankTransactionSyncService.resolveWindow(TODAY, LocalDate.of(2026, 8, 31)))
                .isEqualTo(new SyncWindow(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 31), LocalDate.of(2026, 8, 31)));
    }
}
