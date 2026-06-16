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
}
