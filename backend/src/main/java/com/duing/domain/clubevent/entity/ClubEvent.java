package com.duing.domain.clubevent.entity;

import com.duing.domain.clubevent.exception.ClubEventException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "club_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_event SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubEvent extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(nullable = false, length = 120)     private String title;
    @Column(columnDefinition = "TEXT")          private String description;
    @Column(name = "start_at", nullable = false) private LocalDateTime startAt;
    @Column(name = "end_at",   nullable = false) private LocalDateTime endAt;
    @Column(length = 200)                       private String location;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubEvent(Long clubId, String title, String description,
                      LocalDateTime startAt, LocalDateTime endAt,
                      String location, Long createdBy) {
        validatePeriod(startAt, endAt);
        validateTitle(title);
        this.clubId = clubId;
        this.title = title.trim();
        this.description = description;
        this.startAt = startAt;
        this.endAt = endAt;
        this.location = location;
        this.createdBy = createdBy;
    }

    public static ClubEvent create(Long clubId, String title, String description,
                                   LocalDateTime startAt, LocalDateTime endAt,
                                   String location, Long createdBy) {
        return ClubEvent.builder()
                .clubId(clubId).title(title).description(description)
                .startAt(startAt).endAt(endAt).location(location).createdBy(createdBy)
                .build();
    }

    public void update(String title, String description,
                       LocalDateTime startAt, LocalDateTime endAt, String location) {
        LocalDateTime nextStart = startAt != null ? startAt : this.startAt;
        LocalDateTime nextEnd   = endAt   != null ? endAt   : this.endAt;
        validatePeriod(nextStart, nextEnd);
        if (title != null) {
            validateTitle(title);
            this.title = title.trim();
        }
        if (description != null) this.description = blankToNull(description);
        if (startAt != null) this.startAt = startAt;
        if (endAt != null) this.endAt = endAt;
        if (location != null) this.location = blankToNull(location);
    }

    private static void validatePeriod(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw new ClubEventException.InvalidPeriodException();
        }
        if (end.isBefore(start)) {
            throw new ClubEventException.InvalidPeriodException();
        }
    }

    private static void validateTitle(String title) {
        if (title == null || title.trim().isEmpty()) {
            throw new ClubEventException.InvalidTitleException();
        }
    }

    /** 빈 문자열·공백만 있는 텍스트는 null 로 정규화한다(비우기 의도 ""를 저장은 null 로 통일). */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
