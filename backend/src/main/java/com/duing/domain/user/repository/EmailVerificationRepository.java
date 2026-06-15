package com.duing.domain.user.repository;

import com.duing.domain.user.entity.EmailVerification;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    Optional<EmailVerification> findByEmail(String email);

    /**
     * 행 잠금 조회 — 동시 발송(코드 덮어쓰기·메일 2통)과 병렬 confirm 의
     * attempt 카운트 유실을 막는다 (spec §7.3).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT ev FROM EmailVerification ev WHERE ev.email = :email")
    Optional<EmailVerification> findByEmailForUpdate(@Param("email") String email);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM EmailVerification ev WHERE ev.email = :email")
    void deleteByEmail(@Param("email") String email);

    /**
     * 보관기간을 넘긴 일회용 인증 코드 행(raw 이메일 = PII)을 물리 삭제한다.
     * email_verifications 는 soft-delete 가 없는 단명 데이터라 users/application 의 deleted_at 대신
     * created_at 을 기준으로 한다 — 보관기간 이상 방치된(가입 미완료 포함) 행을 동일 window 로 정리한다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM email_verifications WHERE created_at < :cutoff", nativeQuery = true)
    int deleteExpiredVerifications(@Param("cutoff") LocalDateTime cutoff);
}
