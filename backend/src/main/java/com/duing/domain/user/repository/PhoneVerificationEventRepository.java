package com.duing.domain.user.repository;

import com.duing.domain.user.entity.PhoneVerificationEvent;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PhoneVerificationEventRepository extends JpaRepository<PhoneVerificationEvent, Long> {

    /** 보관기간(45일)을 넘긴 감사 이벤트(raw phone = PII) 물리 삭제 — PiiRetentionJob (spec §9.3). */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM phone_verification_events WHERE created_at < :cutoff", nativeQuery = true)
    int deleteExpiredEvents(@Param("cutoff") LocalDateTime cutoff);
}
