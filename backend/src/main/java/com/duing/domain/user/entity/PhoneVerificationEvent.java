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
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * MO 인증 감사 이벤트 (insert-only, spec §9.3) — 학번 도용 분쟁·번호 변경 이력·abuse 추적 근거.
 * raw phone(PII)을 포함하므로 PiiRetentionJob 이 45일 후 물리 삭제한다. 조회 화면은 없다(운영자 DB 콘솔).
 * soft delete 미적용(물리 파기 대상)이라 BaseEntity 를 상속하지 않는다.
 */
@Getter
@Entity
@Table(name = "phone_verification_events")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PhoneVerificationEvent {

    private static final int USER_AGENT_MAX_LENGTH = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 13)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VerificationPurpose purpose;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private PhoneVerificationEventType eventType;

    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "user_agent", length = USER_AGENT_MAX_LENGTH)
    private String userAgent;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PhoneVerificationEvent(Long userId, String phone, VerificationPurpose purpose,
                                   PhoneVerificationEventType eventType, String clientIp, String userAgent) {
        this.userId = userId;
        this.phone = phone;
        this.purpose = purpose;
        this.eventType = eventType;
        this.clientIp = clientIp;
        this.userAgent = userAgent;
    }

    public static PhoneVerificationEvent verified(PhoneVerification phoneVerification,
                                                  String clientIp, String userAgent) {
        return PhoneVerificationEvent.builder()
                .userId(phoneVerification.getTargetUserId())
                .phone(phoneVerification.getPhone())
                .purpose(phoneVerification.getPurpose())
                .eventType(PhoneVerificationEventType.VERIFIED)
                .clientIp(clientIp)
                .userAgent(truncateUserAgent(userAgent))
                .build();
    }

    public static PhoneVerificationEvent consumed(PhoneVerification phoneVerification, Long userId,
                                                  String clientIp, String userAgent) {
        return PhoneVerificationEvent.builder()
                .userId(userId)
                .phone(phoneVerification.getPhone())
                .purpose(phoneVerification.getPurpose())
                .eventType(PhoneVerificationEventType.CONSUMED)
                .clientIp(clientIp)
                .userAgent(truncateUserAgent(userAgent))
                .build();
    }

    /** User-Agent 는 임의 길이 헤더 — 컬럼(300자)에 맞춰 자른다 (초과분은 감사 가치가 없다). */
    private static String truncateUserAgent(String userAgent) {
        if (userAgent == null || userAgent.length() <= USER_AGENT_MAX_LENGTH) {
            return userAgent;
        }
        return userAgent.substring(0, USER_AGENT_MAX_LENGTH);
    }
}
