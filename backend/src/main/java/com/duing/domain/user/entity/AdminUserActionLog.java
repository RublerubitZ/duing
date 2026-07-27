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
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * 관리자 조치 감사 로그 — insert-only. 수정·삭제 메서드를 두지 않으므로 updated_at·deleted_at 컬럼도 두지 않는다
 * (phone_verification_events 전례). 개인정보(번호·이름)와 메모 본문은 저장하지 않는다 — 사실만 남기고
 * 값은 users 조인으로 해석한다. 작업자 이름을 스냅샷하지 않는 것도 같은 이유다.
 *
 * <p>createdAt 은 Instant + timestamptz — 신규 테이블이라 TIMEZONE.md 2단계 전환 대상이 아니고,
 * "신규 API 는 Event Time 을 Instant 로 응답한다"는 규칙을 변환 없이 만족한다(TimeMapper 를 태우지 않는다).
 */
@Getter
@Entity
@Table(name = "admin_user_action_log")
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdminUserActionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;

    @Column(name = "target_user_id", nullable = false)
    private Long targetUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private AdminUserAction action;

    @Column(length = 500)
    private String reason;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder(access = AccessLevel.PRIVATE)
    private AdminUserActionLog(Long actorUserId, Long targetUserId, AdminUserAction action, String reason) {
        this.actorUserId = actorUserId;
        this.targetUserId = targetUserId;
        this.action = action;
        this.reason = reason;
    }

    public static AdminUserActionLog of(Long actorUserId, Long targetUserId,
                                        AdminUserAction action, String reason) {
        return AdminUserActionLog.builder()
                .actorUserId(actorUserId)
                .targetUserId(targetUserId)
                .action(action)
                .reason(reason)
                .build();
    }
}
