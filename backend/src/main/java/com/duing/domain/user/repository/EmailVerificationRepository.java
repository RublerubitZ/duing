package com.duing.domain.user.repository;

import com.duing.domain.user.entity.EmailVerification;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    Optional<EmailVerification> findByEmail(String email);

    /**
     * 행 잠금 조회 — 동시 발송(코드 덮어쓰기·메일 2통)과 병렬 confirm 의
     * attempt 카운트 유실을 막는다 (spec §7.3).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT emailVerification FROM EmailVerification emailVerification WHERE emailVerification.email = :email")
    Optional<EmailVerification> findByEmailForUpdate(@Param("email") String email);

    void deleteByEmail(String email);
}
