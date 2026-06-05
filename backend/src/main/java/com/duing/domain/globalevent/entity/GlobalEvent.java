package com.duing.domain.globalevent.entity;

import com.duing.domain.globalevent.exception.GlobalEventException;
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
@Table(name = "global_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE global_event SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class GlobalEvent extends BaseEntity {

    @Column(nullable = false, length = 120)              private String title;
    @Column(columnDefinition = "TEXT")                   private String description;
    @Column(name = "start_at", nullable = false)         private LocalDateTime startAt;
    @Column(name = "end_at",   nullable = false)         private LocalDateTime endAt;
    @Column(length = 200)                                private String location;
    @Column(name = "link_url", length = 500)             private String linkUrl;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)               private GlobalEventCategory category;
    @Column(name = "created_by", nullable = false)       private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private GlobalEvent(String title, String description,
                        LocalDateTime startAt, LocalDateTime endAt,
                        String location, String linkUrl,
                        GlobalEventCategory category, Long createdBy) {
        validateTitle(title);
        validatePeriod(startAt, endAt);
        this.title = title.trim();
        this.description = description;
        this.startAt = startAt;
        this.endAt = endAt;
        this.location = location;
        this.linkUrl = linkUrl;
        this.category = category;
        this.createdBy = createdBy;
    }

    public static GlobalEvent create(String title, String description,
                                     LocalDateTime startAt, LocalDateTime endAt,
                                     String location, String linkUrl,
                                     GlobalEventCategory category, Long createdBy) {
        return GlobalEvent.builder()
                .title(title).description(description)
                .startAt(startAt).endAt(endAt)
                .location(location).linkUrl(linkUrl)
                .category(category).createdBy(createdBy)
                .build();
    }

    public void update(String title, String description,
                       LocalDateTime startAt, LocalDateTime endAt,
                       String location, String linkUrl,
                       GlobalEventCategory category) {
        LocalDateTime nextStart = startAt != null ? startAt : this.startAt;
        LocalDateTime nextEnd   = endAt   != null ? endAt   : this.endAt;
        validatePeriod(nextStart, nextEnd);
        if (title != null) {
            validateTitle(title);
            this.title = title.trim();
        }
        if (description != null) this.description = description;
        if (startAt != null) this.startAt = startAt;
        if (endAt != null) this.endAt = endAt;
        if (location != null) this.location = location;
        if (linkUrl != null) this.linkUrl = linkUrl;
        if (category != null) this.category = category;
    }

    private static void validatePeriod(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw new GlobalEventException.InvalidPeriodException();
        }
        if (end.isBefore(start)) {
            throw new GlobalEventException.InvalidPeriodException();
        }
    }

    private static void validateTitle(String title) {
        if (title == null || title.trim().isEmpty()) {
            throw new GlobalEventException.InvalidTitleException();
        }
    }
}
