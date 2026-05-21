package com.duing.domain.club.entity;

import com.duing.domain.club.exception.ClubException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "recertification_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recertification_request SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class RecertificationRequest extends BaseEntity {

    @Column(name = "round_id", nullable = false) private Long roundId;
    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "leader_user_id", nullable = false) private Long leaderUserId;

    @Column(name = "contact_email", nullable = false, length = 255) private String contactEmail;
    @Column(name = "contact_phone", nullable = false, length = 40) private String contactPhone;
    @Column(name = "operating_year", nullable = false) private int operatingYear;

    @Column(columnDefinition = "TEXT") private String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private RecertificationStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private RecertificationRequest(Long roundId, Long clubId, Long leaderUserId,
                                   String contactEmail, String contactPhone,
                                   int operatingYear, String notes) {
        this.roundId = roundId;
        this.clubId = clubId;
        this.leaderUserId = leaderUserId;
        this.contactEmail = contactEmail;
        this.contactPhone = contactPhone;
        this.operatingYear = operatingYear;
        this.notes = notes;
        this.status = RecertificationStatus.PENDING;
    }

    public static RecertificationRequest create(Long roundId, Long clubId, Long leaderUserId,
                                                String contactEmail, String contactPhone,
                                                int operatingYear, String notes) {
        return RecertificationRequest.builder()
                .roundId(roundId).clubId(clubId).leaderUserId(leaderUserId)
                .contactEmail(contactEmail).contactPhone(contactPhone)
                .operatingYear(operatingYear).notes(notes)
                .build();
    }

    public void process(Long handlerUserId, RecertificationStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == RecertificationStatus.PENDING) {
            throw new ClubException.InvalidRecertificationTransitionException(
                    "처리 결과는 APPROVED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ClubException.InvalidRecertificationTransitionException("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
