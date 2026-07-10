package com.duing.domain.user.repository;

import com.duing.domain.user.entity.PhoneVerification;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PhoneVerificationRepository extends JpaRepository<PhoneVerification, Long> {

    Optional<PhoneVerification> findByToken(String token);

    /** 행 잠금 조회 — 동시 발급의 코드 덮어쓰기·쿨다운 우회를 막는다 (spec §9.5). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT pv FROM PhoneVerification pv WHERE pv.phone = :phone")
    Optional<PhoneVerification> findByPhoneForUpdate(@Param("phone") String phone);

    /** 행 잠금 조회 — 동시 상태조회의 이중 인증 확정을 멱등하게 만든다 (spec §9.5). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT pv FROM PhoneVerification pv WHERE pv.token = :token")
    Optional<PhoneVerification> findByTokenForUpdate(@Param("token") String token);

    /**
     * 만료 후 24시간 지난 세션(raw 전화번호 = PII)을 물리 삭제한다 — PiiRetentionJob (spec §9.4).
     * 버려진(가입 미완료) 세션의 번호가 무기한 잔존하지 않게 한다. cutoff = now - 1일 을 expires_at 과 비교.
     * 주의: 이 cutoff 는 45일 보관창(privacy.retention.window)이 아니라 별도의 24시간 유예다 —
     * 호출자(PiiRetentionJob)가 now-1일 을 따로 계산해 넘겨야 한다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM phone_verifications WHERE expires_at < :cutoff", nativeQuery = true)
    int deleteExpiredVerifications(@Param("cutoff") LocalDateTime cutoff);
}
