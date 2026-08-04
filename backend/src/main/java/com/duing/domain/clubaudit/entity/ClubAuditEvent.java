package com.duing.domain.clubaudit.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 동아리 운영 감사 이벤트 (V102, 스펙 v2 4.1) — append-only, 수정·삭제 메서드를 두지 않는다.
 * deleted_at 은 BaseEntity 일관성으로만 존재하고 항상 NULL 이다(facility_submission_audit 전례).
 *
 * <p>대상 행을 연관관계 대신 id 로만 들고 있는다. 감사 기록은 본 트랜잭션에 얹히는 부수 기록이라
 * 엔티티를 참조하면 기록 때문에 대상이 영속성 컨텍스트로 끌려 올라온다 — 특히 모집 삭제 트랜잭션은
 * 가입 코드 엔티티를 로딩하면 커밋이 깨지므로(ClubJoinCodeRepository.revokeActiveByRecruitmentId
 * 주석의 TransientObjectException 함정) id 기록이 이 함정을 원천 차단한다.
 * 사람이 읽을 이름·시각은 조회 시점에 조인해 해석한다(AdminUserActionLog 전례).
 */
@Getter
@Entity
@Table(name = "club_audit_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClubAuditEvent extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 30)
    private ClubAuditEventType eventType;

    /** 이 행위를 한 사용자 — 가입 신청만 학생이고 나머지는 처리한 운영진이다. */
    @Column(name = "actor_user_id", nullable = false)
    private Long actorUserId;

    @Column(name = "recruitment_id")
    private Long recruitmentId;

    @Column(name = "join_code_id")
    private Long joinCodeId;

    @Column(name = "join_request_id")
    private Long joinRequestId;

    /** 열람 대상 지원서(V103) — 총동연 지원서 상세 열람에서만 채워진다. */
    @Column(name = "application_id")
    private Long applicationId;

    /** 조치 사유(V103) — 총동연 강제 마감에서만 채워지며, 공백뿐이면 저장하지 않는다. */
    @Column(name = "reason", length = 500)
    private String reason;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubAuditEvent(Long clubId, ClubAuditEventType eventType, Long actorUserId,
                           Long recruitmentId, Long joinCodeId, Long joinRequestId,
                           Long applicationId, String reason) {
        this.clubId = clubId;
        this.eventType = eventType;
        this.actorUserId = actorUserId;
        this.recruitmentId = recruitmentId;
        this.joinCodeId = joinCodeId;
        this.joinRequestId = joinRequestId;
        this.applicationId = applicationId;
        this.reason = reason;
    }

    /** 가입 링크 생성·재생성·폐기 이벤트. */
    public static ClubAuditEvent joinLink(ClubAuditEventType eventType, Long clubId,
                                          Long recruitmentId, Long joinCodeId, Long actorUserId) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(eventType)
                .actorUserId(actorUserId)
                .recruitmentId(recruitmentId)
                .joinCodeId(joinCodeId)
                .build();
    }

    /** 가입 요청 접수·승인·거절 이벤트 — 어떤 링크로 들어온 요청인지까지 함께 남긴다. */
    public static ClubAuditEvent joinRequest(ClubAuditEventType eventType, Long clubId,
                                             Long recruitmentId, Long joinCodeId,
                                             Long joinRequestId, Long actorUserId) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(eventType)
                .actorUserId(actorUserId)
                .recruitmentId(recruitmentId)
                .joinCodeId(joinCodeId)
                .joinRequestId(joinRequestId)
                .build();
    }

    /** 총동연이 모집을 강제 마감한 이벤트 — 사유는 선택 입력이라 비어 있을 수 있다. */
    public static ClubAuditEvent adminForceClose(Long clubId, Long recruitmentId,
                                                 Long actorUserId, String reason) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(ClubAuditEventType.RECRUITMENT_FORCE_CLOSED)
                .actorUserId(actorUserId)
                .recruitmentId(recruitmentId)
                .reason(reason)
                .build();
    }

    /** 총동연이 지원서 상세를 열람한 이벤트 — 개인정보 열람 이력이라 열람마다 한 건씩 남는다. */
    public static ClubAuditEvent adminApplicationView(Long clubId, Long recruitmentId,
                                                      Long applicationId, Long actorUserId) {
        return ClubAuditEvent.builder()
                .clubId(clubId)
                .eventType(ClubAuditEventType.APPLICATION_VIEWED)
                .actorUserId(actorUserId)
                .recruitmentId(recruitmentId)
                .applicationId(applicationId)
                .build();
    }
}
