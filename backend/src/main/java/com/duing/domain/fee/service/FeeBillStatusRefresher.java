package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 잠금 하에 산출한 활성 납부 합계로 청구 상태를 재산출·전이한다 — '합산→calculate→updateStatus' 시퀀스의 단일 지점.
 *
 * <p><strong>호출 전제(계약)</strong>: {@code lockedBill} 은 이 트랜잭션에서 PESSIMISTIC_WRITE 로 잠금 조회된
 * 관리 엔티티여야 하고, {@code activePaidSum} 은 그 잠금 획득 <em>이후</em> 산출한 합계여야 한다.
 * 잠금 전에 읽은 합계를 넘기면 동시 납부·정정과의 직렬화가 깨진다. 합산 쿼리를 이 클래스로 흡수하지 않는 이유:
 * 호출부가 같은 합계를 검증·이벤트 페이로드에 재사용하므로 여기서 재조회하면 왕복만 늘어난다.
 *
 * <p>CANCELLED 청구는 {@link FeeBill#updateStatus} 의 가드로 전이가 무시되며, 반환값은 산출 상태 그대로다
 * (호출부 로그·이벤트 의미 유지).
 */
@Component
@RequiredArgsConstructor
public class FeeBillStatusRefresher {

    private final FeeBillStatusCalculator statusCalculator;
    private final EntityManager entityManager;

    public FeeStatus refresh(FeeBill lockedBill, long activePaidSum) {
        assert holdsPessimisticWriteLock(lockedBill)
                : "FeeBill 상태 재산출은 PESSIMISTIC_WRITE 잠금 하에서만 허용된다";
        FeeStatus recalculatedStatus = statusCalculator.calculate(
                lockedBill.getAmount(), lockedBill.getDueDate(), activePaidSum);
        lockedBill.updateStatus(recalculatedStatus);
        return recalculatedStatus;
    }

    private boolean holdsPessimisticWriteLock(FeeBill bill) {
        return entityManager.contains(bill)
                && entityManager.getLockMode(bill) == LockModeType.PESSIMISTIC_WRITE;
    }
}
