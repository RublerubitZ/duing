package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeBillStatusRefresherTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // 2026-07-15 KST 고정 — 마감(7/31) 이전 시점
    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-07-15T03:00:00Z"), SEOUL);

    private final EntityManager entityManager = mock(EntityManager.class);
    private final FeeBillStatusRefresher statusRefresher =
            new FeeBillStatusRefresher(new FeeBillStatusCalculator(FIXED_CLOCK), entityManager);

    private FeeBill lockedBill() {
        FeeBill bill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        when(entityManager.contains(bill)).thenReturn(true);
        when(entityManager.getLockMode(bill)).thenReturn(LockModeType.PESSIMISTIC_WRITE);
        return bill;
    }

    @Test
    @DisplayName("잠금된 청구는 활성 납부 합계로 상태가 재산출·전이되고 그 상태가 반환된다")
    void refreshRecalculatesAndTransitionsLockedBill() {
        FeeBill bill = lockedBill();
        FeeStatus newStatus = statusRefresher.refresh(bill, 10000L);
        assertThat(newStatus).isEqualTo(FeeStatus.PAID);
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.PAID);
    }

    @Test
    @DisplayName("취소된 청구는 전이가 무시되지만 반환값은 산출 상태 그대로다 — 호출부 로그·이벤트 의미 유지")
    void refreshKeepsCancelledBillButReturnsRecalculatedStatus() {
        FeeBill bill = lockedBill();
        bill.cancel();
        FeeStatus newStatus = statusRefresher.refresh(bill, 4000L);
        assertThat(newStatus).isEqualTo(FeeStatus.PARTIAL_PAID);
        assertThat(bill.getStatus()).isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("비관적 잠금 없이 재산출을 시도하면 계약 위반으로 실패한다")
    void refreshRejectsBillWithoutPessimisticLock() {
        FeeBill detachedBill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        when(entityManager.contains(detachedBill)).thenReturn(false);
        assertThatThrownBy(() -> statusRefresher.refresh(detachedBill, 0L))
                .isInstanceOf(AssertionError.class);
    }

    @Test
    @DisplayName("관리 엔티티라도 비관적 잠금이 없으면 재산출은 계약 위반으로 실패한다")
    void refreshRejectsManagedButUnlockedBill() {
        FeeBill unlockedBill = FeeBill.issue(1L, 2L, 3L, 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        when(entityManager.contains(unlockedBill)).thenReturn(true);
        when(entityManager.getLockMode(unlockedBill)).thenReturn(LockModeType.NONE);
        assertThatThrownBy(() -> statusRefresher.refresh(unlockedBill, 0L))
                .isInstanceOf(AssertionError.class);
    }
}
