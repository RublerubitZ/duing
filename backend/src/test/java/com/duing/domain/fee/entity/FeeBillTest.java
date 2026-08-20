package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeBillTest {

    @Test
    @DisplayName("청구서를 발행하면 상태가 PENDING 으로 생성된다")
    void issueCreatesPendingBill() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.PENDING);
        assertThat(bill.getAmount()).isEqualTo(10000L);
    }

    @Test
    @DisplayName("청구서를 취소하면 상태가 CANCELLED 로 전이된다")
    void cancelTransitionsToCancelled() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        bill.cancel();
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("취소된 청구는 자동 산출 상태 전이로 덮어써지지 않는다")
    void updateStatusDoesNotOverrideCancelledBill() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        bill.cancel();
        bill.updateStatus(FeeStatus.OVERDUE);
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("잔액은 청구액에서 활성 납부 합계를 뺀 값이다 — 미납이면 전액, 완납이면 0")
    void remainingAfterSubtractsActivePaidSumFromAmount() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        assertThat(bill.remainingAfter(0L)).isEqualTo(10000L);
        assertThat(bill.remainingAfter(4000L)).isEqualTo(6000L);
        assertThat(bill.remainingAfter(10000L)).isZero();
        assertThat(bill.remainingAfter(12000L)).isEqualTo(-2000L); // 음수 비클램프 계약 핀
    }
}
