package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PaymentTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /** 회비 시각은 전부 KST 의미라, 픽스처도 KST 벽시계를 절대시각으로 굳혀 만든다. */
    private static Instant kst(int year, int month, int day, int hour, int minute) {
        return LocalDateTime.of(year, month, day, hour, minute).atZone(SEOUL).toInstant();
    }

    @Test
    @DisplayName("납부를 기록하면 상태가 ACTIVE 로 생성되고 isActive 가 참이다")
    void recordCreatesActivePayment() {
        Payment payment = Payment.record(1L, 10000L, PaymentMethod.TRANSFER,
                kst(2026, 6, 15, 10, 0), 2L, "6월 회비");

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.ACTIVE);
        assertThat(payment.isActive()).isTrue();
        assertThat(payment.getAmount()).isEqualTo(10000L);
        assertThat(payment.getMethod()).isEqualTo(PaymentMethod.TRANSFER);
    }

    @Test
    @DisplayName("납부를 정정하면 상태가 VOIDED 로 전이되고 정정 메타가 채워진다")
    void voidPaymentTransitionsToVoidedWithMeta() {
        Payment payment = Payment.record(1L, 10000L, PaymentMethod.TRANSFER,
                kst(2026, 6, 15, 10, 0), 2L, "6월 회비");
        Instant voidedAt = kst(2026, 6, 16, 9, 0);

        payment.voidPayment(3L, "중복 입력", voidedAt);

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.VOIDED);
        assertThat(payment.isActive()).isFalse();
        assertThat(payment.getVoidedBy()).isEqualTo(3L);
        assertThat(payment.getVoidedAt()).isEqualTo(voidedAt);
        assertThat(payment.getVoidReason()).isEqualTo("중복 입력");
    }

    @Test
    @DisplayName("이미 정정된 납부를 다시 정정하면 기존 정정 메타가 그대로 유지된다(멱등)")
    void voidPaymentIsIdempotentWhenAlreadyVoided() {
        Payment payment = Payment.record(1L, 10000L, PaymentMethod.TRANSFER,
                kst(2026, 6, 15, 10, 0), 2L, "6월 회비");
        Instant firstVoidedAt = kst(2026, 6, 16, 9, 0);
        payment.voidPayment(3L, "중복 입력", firstVoidedAt);

        payment.voidPayment(99L, "재정정 시도", kst(2026, 6, 17, 9, 0));

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.VOIDED);
        assertThat(payment.getVoidedBy()).isEqualTo(3L);
        assertThat(payment.getVoidedAt()).isEqualTo(firstVoidedAt);
        assertThat(payment.getVoidReason()).isEqualTo("중복 입력");
    }
}
