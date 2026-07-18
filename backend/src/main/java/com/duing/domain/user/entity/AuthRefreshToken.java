package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "auth_refresh_token")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthRefreshToken extends BaseEntity {

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** SHA-256 hex — 토큰 원문은 어디에도 저장하지 않는다. */
    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private RefreshTokenStatus status;

    /** ROTATED 전환 시각 = 동시 탭 grace 판정 기준점 (spec §11). */
    @Column(name = "rotated_at")
    private LocalDateTime rotatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private AuthRefreshToken(Long sessionId, String tokenHash) {
        this.sessionId = sessionId;
        this.tokenHash = tokenHash;
        this.status = RefreshTokenStatus.ACTIVE;
    }

    public static AuthRefreshToken issue(Long sessionId, String tokenHash) {
        return AuthRefreshToken.builder()
                .sessionId(sessionId)
                .tokenHash(tokenHash)
                .build();
    }

    public void markRotated(LocalDateTime now) {
        this.status = RefreshTokenStatus.ROTATED;
        this.rotatedAt = now;
    }

    public void markRevoked() {
        this.status = RefreshTokenStatus.REVOKED;
    }

    /** 폐기(ROTATED) 직후 grace 창 안의 재제시 = 동시 탭으로 간주한다 (spec §5.3, §11). */
    public boolean isReusableWithinGrace(LocalDateTime now, Duration grace) {
        return status == RefreshTokenStatus.ROTATED
                && rotatedAt != null
                && rotatedAt.plus(grace).isAfter(now);
    }
}
