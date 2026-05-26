package com.duing.domain.clubmember.entity;

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
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "club_member_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_member_history SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubMemberHistory extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "target_user_id", nullable = false) private Long targetUserId;
    @Column(name = "actor_user_id", nullable = false) private Long actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40) private ClubMemberEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_role", length = 20) private ClubMemberRole fromRole;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_role", length = 20) private ClubMemberRole toRole;

    @Column(columnDefinition = "TEXT") private String reason;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubMemberHistory(Long clubId, Long targetUserId, Long actorUserId,
                              ClubMemberEventType eventType,
                              ClubMemberRole fromRole, ClubMemberRole toRole, String reason) {
        this.clubId = clubId;
        this.targetUserId = targetUserId;
        this.actorUserId = actorUserId;
        this.eventType = eventType;
        this.fromRole = fromRole;
        this.toRole = toRole;
        this.reason = reason;
    }

    public static ClubMemberHistory of(Long clubId, Long targetUserId, Long actorUserId,
                                       ClubMemberEventType eventType,
                                       ClubMemberRole fromRole, ClubMemberRole toRole, String reason) {
        return ClubMemberHistory.builder()
                .clubId(clubId).targetUserId(targetUserId).actorUserId(actorUserId)
                .eventType(eventType).fromRole(fromRole).toRole(toRole).reason(reason)
                .build();
    }
}
