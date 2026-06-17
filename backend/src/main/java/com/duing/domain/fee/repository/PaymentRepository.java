package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.Payment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findByFeeBillIdOrderByCreatedAtAsc(Long feeBillId);

    Optional<Payment> findByIdAndFeeBillId(Long id, Long feeBillId);

    @Query("""
            SELECT COALESCE(SUM(p.amount), 0) FROM Payment p
            WHERE p.feeBillId = :feeBillId AND p.status = com.duing.domain.fee.entity.PaymentStatus.ACTIVE
            """)
    long sumActiveByFeeBillId(@Param("feeBillId") Long feeBillId);
}
