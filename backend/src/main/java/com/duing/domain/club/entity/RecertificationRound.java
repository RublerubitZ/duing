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
@Table(name = "recertification_round")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recertification_round SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class RecertificationRound extends BaseEntity {

    @Column(nullable = false) private int year;
    @Column(nullable = false, length = 100) private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private RoundStatus status;

    @Column(name = "opened_by", nullable = false) private Long openedBy;
    @Column(name = "opened_at", nullable = false) private LocalDateTime openedAt;
    @Column(name = "closed_by") private Long closedBy;
    @Column(name = "closed_at") private LocalDateTime closedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private RecertificationRound(int year, String label, Long openedBy) {
        this.year = year;
        this.label = label;
        this.openedBy = openedBy;
        this.openedAt = LocalDateTime.now();
        this.status = RoundStatus.OPEN;
    }

    public static RecertificationRound open(int year, String label, Long openedBy) {
        return RecertificationRound.builder()
                .year(year).label(label).openedBy(openedBy)
                .build();
    }

    public void close(Long closedByUserId) {
        if (this.status.isClosed()) {
            throw new ClubException.RoundAlreadyClosedException();
        }
        this.status = RoundStatus.CLOSED;
        this.closedBy = closedByUserId;
        this.closedAt = LocalDateTime.now();
    }
}
