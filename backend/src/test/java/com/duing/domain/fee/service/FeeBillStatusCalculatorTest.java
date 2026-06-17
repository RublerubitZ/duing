package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.fee.entity.FeeStatus;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeBillStatusCalculatorTest {

    // 오늘을 2026-06-15(Asia/Seoul)로 고정해 마감 경과 판정을 결정적으로 검증한다.
    private final Clock clock = Clock.fixed(
            LocalDate.of(2026, 6, 15).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));
    private final FeeBillStatusCalculator calculator = new FeeBillStatusCalculator(clock);

    @Test
    @DisplayName("납부 합계가 청구액 이상이면 마감 전이라도 PAID 로 산출된다")
    void fullyPaidBeforeDueIsPaid() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 10000L);
        assertThat(status).isEqualTo(FeeStatus.PAID);
    }

    @Test
    @DisplayName("납부 합계가 청구액 이상이면 마감이 지났어도 PAID 로 산출된다")
    void fullyPaidAfterDueIsPaid() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 1), 12000L);
        assertThat(status).isEqualTo(FeeStatus.PAID);
    }

    @Test
    @DisplayName("일부만 납부했고 마감 전이면 PARTIAL_PAID 로 산출된다")
    void partiallyPaidBeforeDueIsPartialPaid() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 4000L);
        assertThat(status).isEqualTo(FeeStatus.PARTIAL_PAID);
    }

    @Test
    @DisplayName("납부가 없고 마감 전이면 PENDING 으로 산출된다")
    void unpaidBeforeDueIsPending() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 0L);
        assertThat(status).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("미납 상태로 마감이 지나면 OVERDUE 로 산출된다")
    void unpaidAfterDueIsOverdue() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 14), 0L);
        assertThat(status).isEqualTo(FeeStatus.OVERDUE);
    }

    @Test
    @DisplayName("일부만 납부한 채 마감이 지나면 OVERDUE 로 산출된다")
    void partiallyPaidAfterDueIsOverdue() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 14), 4000L);
        assertThat(status).isEqualTo(FeeStatus.OVERDUE);
    }

    @Test
    @DisplayName("마감일이 오늘이면 미납이라도 아직 연체가 아니므로 PENDING 으로 산출된다")
    void unpaidOnDueDateIsNotOverdueYet() {
        FeeStatus status = calculator.calculate(10000L, LocalDate.of(2026, 6, 15), 0L);
        assertThat(status).isEqualTo(FeeStatus.PENDING);
    }
}
