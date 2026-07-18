package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 인증 보안 이벤트 감사 로그 — append-only, 수정 메서드를 두지 않는다 (spec §7.1). */
@Getter
@Entity
@Table(name = "auth_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthEvent extends BaseEntity {

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "session_id")
    private Long sessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private AuthEventType eventType;

    @Column(length = 500)
    private String detail;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    private AuthEvent(Long userId, Long sessionId, AuthEventType eventType,
                      String detail, String ipAddress, String userAgent) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.eventType = eventType;
        this.detail = detail;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    public static AuthEvent of(Long userId, Long sessionId, AuthEventType eventType,
                               String detail, String ipAddress, String userAgent) {
        return new AuthEvent(userId, sessionId, eventType, detail, ipAddress, userAgent);
    }
}
