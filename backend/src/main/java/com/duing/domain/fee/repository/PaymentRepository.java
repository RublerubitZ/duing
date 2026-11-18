package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentStatus;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findByFeeBillIdOrderByCreatedAtAsc(Long feeBillId);

    Optional<Payment> findByIdAndFeeBillId(Long id, Long feeBillId);

    // 매칭취소 시 BANK 거래에 연결된 활성 납부를 찾는다. 매칭 납부는 거래 1건당 ACTIVE 1건이 유지된다.
    Optional<Payment> findByBankTransactionIdAndStatus(Long bankTransactionId, PaymentStatus status);

    // ACTIVE 납부 합산의 단건 정본(벌크 쌍은 아래 sumActiveGroupedByFeeBillIds → FeePaidAmountReader).
    // 쓰기 경로(record/void/매칭/매칭취소)는 청구 잠금 획득 '이후' 이 쿼리를 호출한다 — FeeBillStatusRefresher 계약 참조.
    @Query("""
            SELECT COALESCE(SUM(p.amount), 0) FROM Payment p
            WHERE p.feeBillId = :feeBillId AND p.status = com.duing.domain.fee.entity.PaymentStatus.ACTIVE
            """)
    long sumActiveByFeeBillId(@Param("feeBillId") Long feeBillId);

    @Query("""
            SELECT p.feeBillId, COALESCE(SUM(p.amount), 0)
            FROM Payment p
            WHERE p.feeBillId IN :feeBillIds
              AND p.status = com.duing.domain.fee.entity.PaymentStatus.ACTIVE
            GROUP BY p.feeBillId
            """)
    List<Object[]> sumActiveGroupedByFeeBillIds(@Param("feeBillIds") Collection<Long> feeBillIds);

    /** 주간 브리핑 — 기간에 입력한 납부 기록(감사 created_at). 나중에 정정된 납부도 센다(상태 무관). from 포함·to 미만. */
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    /** 주간 브리핑 — 기간에 정정한 납부(voided_at, 절대 시각). 이상 징후 FA-02 와 같은 축. from 포함·to 미만. */
    long countByVoidedAtGreaterThanEqualAndVoidedAtLessThan(Instant from, Instant to);
}
