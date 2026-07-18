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
@Table(name = "auth_session")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthSession extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SessionPlatform platform;

    @Column(name = "device_label", length = 100)
    private String deviceLabel;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    /** 웹 "로그인 상태 유지" — rotation 시 쿠키 지속성(Persistent/Session) 복원 근거 (spec §10.1). */
    @Column(name = "remember_me", nullable = false)
    private boolean rememberMe;

    @Column(name = "last_used_at", nullable = false)
    private LocalDateTime lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoke_reason", length = 30)
    private SessionRevokeReason revokeReason;

    @Builder(access = AccessLevel.PRIVATE)
    private AuthSession(Long userId, SessionPlatform platform, String deviceLabel, String userAgent,
                        String ipAddress, boolean rememberMe, LocalDateTime lastUsedAt, LocalDateTime expiresAt) {
        this.userId = userId;
        this.platform = platform;
        this.deviceLabel = deviceLabel;
        this.userAgent = userAgent;
        this.ipAddress = ipAddress;
        this.rememberMe = rememberMe;
        this.lastUsedAt = lastUsedAt;
        this.expiresAt = expiresAt;
    }

    public static AuthSession create(Long userId, SessionPlatform platform, String deviceLabel,
                                     String userAgent, String ipAddress, boolean rememberMe,
                                     LocalDateTime now, Duration ttl) {
        return AuthSession.builder()
                .userId(userId)
                .platform(platform)
                .deviceLabel(AuthTextTruncator.truncate(deviceLabel, 100))
                .userAgent(AuthTextTruncator.truncate(userAgent, 500))
                .ipAddress(AuthTextTruncator.truncate(ipAddress, 45))
                .rememberMe(rememberMe)
                .lastUsedAt(now)
                .expiresAt(now.plus(ttl))
                .build();
    }

    /** rotation 성공 시 sliding — 마지막 사용을 기록하고 만료를 now+ttl 로 연장한다 (spec §4). */
    public void touch(LocalDateTime now, Duration ttl) {
        this.lastUsedAt = now;
        this.expiresAt = now.plus(ttl);
    }

    public void revoke(LocalDateTime now, SessionRevokeReason reason) {
        if (this.revokedAt == null) {
            this.revokedAt = now;
            this.revokeReason = reason;
        }
    }

    public boolean isUsable(LocalDateTime now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }
}
