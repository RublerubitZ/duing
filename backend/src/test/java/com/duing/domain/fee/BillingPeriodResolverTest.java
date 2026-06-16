package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.service.BillingPeriodResolver;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BillingPeriodResolverTest {

    // 발행일을 2026-06-15(Asia/Seoul)로 고정해 기본 마감일 산출을 결정적으로 검증한다.
    private final Clock clock = Clock.fixed(
            LocalDate.of(2026, 6, 15).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));
    private final BillingPeriodResolver resolver = new BillingPeriodResolver(clock);

    @Test
    @DisplayName("MONTHLY 는 회차 라벨로 해당 월 1일~말일과 말일 마감을 산출한다")
    void monthly() {
        BillingPeriodResolver.Resolved resolved = resolver.resolveMonthly("2026-07");
        assertThat(resolved.billingPeriod()).isEqualTo("2026-07");
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(resolved.endDate()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("YEARLY 는 1/1~12/31 기간과 기본 마감 = 발행월 말일(2026-06-30)을 산출한다")
    void yearly() {
        BillingPeriodResolver.Resolved resolved = resolver.resolveYearly("2026", null);
        assertThat(resolved.billingPeriod()).isEqualTo("2026");
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(resolved.endDate()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 6, 30)); // 발행월(2026-06) 말일
    }

    @Test
    @DisplayName("미래 연도를 선발행하면 기본 마감을 기간 시작일로 clamp 해 due < start 를 막는다")
    void yearlyFutureClampsToStart() {
        BillingPeriodResolver.Resolved resolved = resolver.resolveYearly("2027", null); // 발행일 2026-06-15
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2027, 1, 1));
        // 발행월 말일(2026-06-30) < 기간 시작(2027-01-01) → start 로 clamp(§5.1-1·chk_fee_bill_due_in_range 위반 방지)
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    @DisplayName("YEARLY 에 운영자가 마감일을 명시하면 기본 산출 대신 그 값을 쓴다")
    void yearlyUsesDueOverride() {
        BillingPeriodResolver.Resolved resolved = resolver.resolveYearly("2026", LocalDate.of(2026, 3, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    }

    @Test
    @DisplayName("명시형(SEMESTER/ONE_TIME)은 입력 기간·마감을 그대로 산출한다")
    void explicit() {
        BillingPeriodResolver.Resolved resolved = resolver.resolveExplicit(
                "2026-1학기", LocalDate.of(2026, 3, 1), LocalDate.of(2026, 8, 31), LocalDate.of(2026, 3, 31));
        assertThat(resolved.billingPeriod()).isEqualTo("2026-1학기");
        assertThat(resolved.startDate()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(resolved.endDate()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(resolved.dueDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    }

    @Test
    @DisplayName("명시형에 기간 끝이 시작보다 앞서면 InvalidBillingPeriodException 을 던진다")
    void explicitRejectsInvertedRange() {
        assertThatThrownBy(() -> resolver.resolveExplicit(
                "잘못", LocalDate.of(2026, 8, 31), LocalDate.of(2026, 3, 1), LocalDate.of(2026, 8, 31)))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }

    @Test
    @DisplayName("명시형에 필수 날짜가 누락되면 InvalidBillingPeriodException 을 던진다")
    void explicitRejectsNullDates() {
        assertThatThrownBy(() -> resolver.resolveExplicit(
                "MT참가비", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 1), null))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }

    @Test
    @DisplayName("MONTHLY 회차 라벨 형식이 잘못되면 InvalidBillingPeriodException 을 던진다")
    void monthlyRejectsMalformedLabel() {
        assertThatThrownBy(() -> resolver.resolveMonthly("2026/07"))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }

    @Test
    @DisplayName("YEARLY 연도 라벨이 숫자가 아니면 InvalidBillingPeriodException 을 던진다")
    void yearlyRejectsNonNumericLabel() {
        assertThatThrownBy(() -> resolver.resolveYearly("올해", null))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }

    @Test
    @DisplayName("MONTHLY 회차에 여분 세그먼트가 있으면(YYYY-MM-DD) 묵묵히 파싱하지 않고 거부한다")
    void monthlyRejectsExtraSegment() {
        assertThatThrownBy(() -> resolver.resolveMonthly("2026-07-01"))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }

    @Test
    @DisplayName("MONTHLY 회차의 월이 범위를 벗어나면(2026-13) 거부한다")
    void monthlyRejectsOutOfRangeMonth() {
        assertThatThrownBy(() -> resolver.resolveMonthly("2026-13"))
                .isInstanceOf(FeeBillException.InvalidBillingPeriodException.class);
    }
}
