package com.duing.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
 * 회원가입 이메일 인증 상태. 이메일당 1행 upsert 로 관리한다.
 *
 * <p>만료 개념은 {@code expiresAt} 하나로 통합 — 코드 유효 시간과 인증 후 가입 유효 시간이 같다.
 * soft delete 미적용 (가입 완료 시 행 삭제, 재발송 시 덮어씀) 이라 BaseEntity 를 상속하지 않는다.
 */
@Getter
@Entity
@Table(name = "email_verifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class EmailVerification {

    public static final Duration VALIDITY = Duration.ofMinutes(20);
    public static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    public static final int MAX_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(name = "code_hash", nullable = false, length = 64)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_sent_at", nullable = false)
    private LocalDateTime lastSentAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private EmailVerification(String email, String codeHash, LocalDateTime expiresAt,
                              LocalDateTime lastSentAt) {
        this.email = email;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.attemptCount = 0;
        this.lastSentAt = lastSentAt;
    }

    public static EmailVerification issue(String email, String codeHash, LocalDateTime now) {
        return EmailVerification.builder()
                .email(email)
                .codeHash(codeHash)
                .expiresAt(now.plus(VALIDITY))
                .lastSentAt(now)
                .build();
    }

    /** 코드 재발급 — 만료·시도·인증 상태를 모두 리셋한다. */
    public void reissue(String codeHash, LocalDateTime now) {
        this.codeHash = codeHash;
        this.expiresAt = now.plus(VALIDITY);
        this.verifiedAt = null;
        this.attemptCount = 0;
        this.lastSentAt = now;
    }

    public void verify(LocalDateTime now) {
        this.verifiedAt = now;
    }

    public void increaseAttempt() {
        this.attemptCount++;
    }

    public boolean isVerified() {
        return verifiedAt != null;
    }

    /** 만료 시각 "부터" 만료로 본다 (now >= expiresAt). */
    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    public boolean isAttemptExceeded() {
        return attemptCount >= MAX_ATTEMPTS;
    }

    public boolean isInCooldown(LocalDateTime now) {
        return now.isBefore(lastSentAt.plus(RESEND_COOLDOWN));
    }

    /** 인증을 마쳤고 아직 만료되지 않았으면 가입에 사용할 수 있다. */
    public boolean isUsableForSignup(LocalDateTime now) {
        return isVerified() && !isExpired(now);
    }
}
