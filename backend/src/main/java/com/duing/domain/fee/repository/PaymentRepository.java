package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentStatus;
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
}
