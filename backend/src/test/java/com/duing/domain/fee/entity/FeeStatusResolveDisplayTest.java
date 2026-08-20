package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeStatusResolveDisplayTest {

    private static final long AMOUNT = 10000L;
    private static final LocalDate DUE = LocalDate.of(2026, 8, 15);

    @Test
    @DisplayName("완납이면 저장 상태가 무엇이든(연체 포함) 표기는 납부완료다 — PAID 최우선")
    void paidWinsRegardlessOfStoredStatus() {
        assertThat(FeeStatus.resolveDisplay(FeeStatus.OVERDUE, AMOUNT, DUE, 10000L, DUE.plusDays(30)))
                .isEqualTo(FeeStatus.PAID);
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PENDING, AMOUNT, DUE, 12000L, DUE.minusDays(1)))
                .isEqualTo(FeeStatus.PAID);
    }

    @Test
    @DisplayName("마감 당일까지는 정상(납부대기/부분납부), 다음날부터 연체로 표기된다 — 배치 실행과 무관")
    void dueDateBoundaryIsExclusiveOfDueDay() {
        // 저장 상태는 PENDING 그대로(배치 미실행 상황)여도 표기는 오늘 기준으로 판정된다.
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PENDING, AMOUNT, DUE, 0L, DUE))
                .isEqualTo(FeeStatus.PENDING);
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PENDING, AMOUNT, DUE, 0L, DUE.plusDays(1)))
                .isEqualTo(FeeStatus.OVERDUE);
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PARTIAL_PAID, AMOUNT, DUE, 4000L, DUE))
                .isEqualTo(FeeStatus.PARTIAL_PAID);
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PARTIAL_PAID, AMOUNT, DUE, 4000L, DUE.plusDays(1)))
                .isEqualTo(FeeStatus.OVERDUE);
    }

    @Test
    @DisplayName("취소된 청구는 마감·납부와 무관하게 취소로 표기된다 — 운영자 결정 통과")
    void cancelledPassesThrough() {
        assertThat(FeeStatus.resolveDisplay(FeeStatus.CANCELLED, AMOUNT, DUE, 0L, DUE.plusDays(30)))
                .isEqualTo(FeeStatus.CANCELLED);
        assertThat(FeeStatus.resolveDisplay(FeeStatus.CANCELLED, AMOUNT, DUE, 10000L, DUE))
                .isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("저장 상태가 이미 연체로 전이됐어도 표기 판정 결과는 동일하다 — 배치 실행 전후 표기 불변")
    void batchTransitionDoesNotChangeDisplay() {
        assertThat(FeeStatus.resolveDisplay(FeeStatus.PENDING, AMOUNT, DUE, 0L, DUE.plusDays(1)))
                .isEqualTo(FeeStatus.resolveDisplay(FeeStatus.OVERDUE, AMOUNT, DUE, 0L, DUE.plusDays(1)));
    }
}
