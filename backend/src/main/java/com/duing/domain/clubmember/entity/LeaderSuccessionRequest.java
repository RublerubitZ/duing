package com.duing.domain.clubmember.entity;

import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "leader_succession_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입 후 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달하므로
// WHERE 절에 version 조건을 명시한다. soft delete 도 OptimisticLock 적용 대상이 된다.
@SQLDelete(sql = "UPDATE leader_succession_request SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class LeaderSuccessionRequest extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "requester_user_id", nullable = false) private Long requesterUserId;

    @Column(nullable = false, columnDefinition = "TEXT") private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private SuccessionStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    // 두 운영진이 동시에 동일 요청을 처리하면 후행 UPDATE 가 0 row affected →
    // ObjectOptimisticLockingFailureException 으로 차단된다. Hibernate 가 직접 채운다.
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private LeaderSuccessionRequest(Long clubId, Long requesterUserId, String reason) {
        this.clubId = clubId;
        this.requesterUserId = requesterUserId;
        this.reason = reason;
        this.status = SuccessionStatus.PENDING;
    }

    public static LeaderSuccessionRequest create(Long clubId, Long requesterUserId, String reason) {
        return LeaderSuccessionRequest.builder()
                .clubId(clubId)
                .requesterUserId(requesterUserId)
                .reason(reason)
                .build();
    }

    public void process(Long handlerUserId, SuccessionStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == SuccessionStatus.PENDING) {
            throw new ClubMemberException.InvalidSuccessionTransition(
                    "처리 결과는 APPROVED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ClubMemberException.InvalidSuccessionTransition("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
