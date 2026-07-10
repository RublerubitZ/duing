package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * MO(문자 발신) 인증 세션. 번호당 1행 upsert 로 관리한다 (spec §5.1).
 *
 * <p>인증 코드는 필드가 없다 — {@code token} 에서 HMAC 파생한다 (spec §5.2, PhoneVerificationCodeDeriver).
 * PENDING 만료는 {@code expiresAt}(발급+5분), VERIFIED 이후에는 용도별 완료 창(verifiedAt 기준)을
 * 따른다. soft delete 미적용 (용도 완료 시 행 삭제, 재발급 시 덮어씀) 이라 BaseEntity 를 상속하지 않는다.
 */
@Getter
@Entity
@Table(name = "phone_verifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PhoneVerification {

    public static final Duration VALIDITY = Duration.ofMinutes(5);
    public static final Duration REISSUE_COOLDOWN = Duration.ofSeconds(60);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 13)
    private String phone;

    @Column(nullable = false, unique = true, length = 36)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VerificationPurpose purpose;

    @Column(name = "target_user_id")
    private Long targetUserId;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "last_issued_at", nullable = false)
    private LocalDateTime lastIssuedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PhoneVerification(String phone, String token, VerificationPurpose purpose,
                              Long targetUserId, LocalDateTime expiresAt, LocalDateTime lastIssuedAt) {
        this.phone = phone;
        this.token = token;
        this.purpose = purpose;
        this.targetUserId = targetUserId;
        this.expiresAt = expiresAt;
        this.lastIssuedAt = lastIssuedAt;
    }

    public static PhoneVerification issue(String phone, String token, VerificationPurpose purpose,
                                          Long targetUserId, LocalDateTime now) {
        return PhoneVerification.builder()
                .phone(phone)
                .token(token)
                .purpose(purpose)
                .targetUserId(targetUserId)
                .expiresAt(now.plus(VALIDITY))
                .lastIssuedAt(now)
                .build();
    }

    /** 재발급 — 토큰(=파생 코드)·용도·만료·인증 상태를 모두 리셋한다. 구 토큰·구 코드는 즉시 무효. */
    public void reissue(String token, VerificationPurpose purpose, Long targetUserId, LocalDateTime now) {
        this.token = token;
        this.purpose = purpose;
        this.targetUserId = targetUserId;
        this.expiresAt = now.plus(VALIDITY);
        this.verifiedAt = null;
        this.lastIssuedAt = now;
    }

    /**
     * 인증 완료를 기록만 한다 — 만료·PENDING 여부 판정은 호출자(서비스)가 {@link #status} 로 선확인한다.
     * (EmailVerification.verify 와 달리 판정 없는 기록임을 이름으로 드러내려 markVerified 로 명명)
     */
    public void markVerified(LocalDateTime now) {
        this.verifiedAt = now;
    }

    public boolean isVerified() {
        return verifiedAt != null;
    }

    /** 만료 시각 "부터" 만료로 본다 (now >= expiresAt) — EmailVerification 경계 규칙 계승. */
    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    public boolean isInCooldown(LocalDateTime now) {
        return now.isBefore(lastIssuedAt.plus(REISSUE_COOLDOWN));
    }

    /** 인증 후 용도별 완료 창(SIGNUP 30분 / 그 외 10분)이 지났는지 (spec §5.1). */
    public boolean isCompletionExpired(LocalDateTime now) {
        return isVerified() && !now.isBefore(verifiedAt.plus(purpose.completionValidity()));
    }

    /** EXPIRED 우선 판정 (spec §5.1) — 인증됐어도 완료 창이 지나면 EXPIRED 로 노출해 재인증을 유도한다. */
    public PhoneVerificationStatus status(LocalDateTime now) {
        if (isVerified()) {
            return isCompletionExpired(now) ? PhoneVerificationStatus.EXPIRED : PhoneVerificationStatus.VERIFIED;
        }
        return isExpired(now) ? PhoneVerificationStatus.EXPIRED : PhoneVerificationStatus.PENDING;
    }

    /** 남은 유효 시간(초) — PENDING 은 세션 만료까지, VERIFIED 는 완료 창 마감까지, 지났으면 0. */
    public long remainingSeconds(LocalDateTime now) {
        LocalDateTime deadline = isVerified() ? verifiedAt.plus(purpose.completionValidity()) : expiresAt;
        return Math.max(Duration.between(now, deadline).getSeconds(), 0);
    }
}
