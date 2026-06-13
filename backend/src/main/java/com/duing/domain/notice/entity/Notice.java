package com.duing.domain.notice.entity;

import com.duing.domain.notice.exception.NoticeException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "notice")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE notice SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Notice extends BaseEntity {

    @Column(nullable = false, length = 120) private String title;
    @Column(nullable = false, length = 300) private String summary;
    @Column(nullable = false, columnDefinition = "TEXT") private String content;
    @Column(name = "cover_image_url", nullable = false, length = 500) private String coverImageUrl;
    @Column(name = "link_url", columnDefinition = "TEXT") private String linkUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30) private NoticeCategory category;

    @Column(name = "tags", columnDefinition = "_text", nullable = false)
    private String[] tags = new String[0];

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30) private NoticeVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "club_scope_role", length = 30) private NoticeClubScopeRole clubScopeRole;

    @Column(name = "is_pinned", nullable = false) private boolean pinned;
    @Column(name = "expires_at") private LocalDateTime expiresAt;
    @Column(name = "notify_on_publish", nullable = false) private boolean notifyOnPublish;
    @Column(name = "author_id", nullable = false) private Long authorId;

    @Column(name = "event_start_at") private LocalDateTime eventStartAt;
    @Column(name = "event_end_at")   private LocalDateTime eventEndAt;
    @Column(length = 200) private String location;
    @Column(length = 200) private String host;
    @Column(length = 200) private String audience;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_format", nullable = false, length = 20)
    private NoticeContentFormat contentFormat = NoticeContentFormat.MARKDOWN;

    // DB 의 body_image_urls 컬럼은 더 이상 매핑하지 않는다(인라인 이미지로 대체). 물리 DROP 은 후속 마이그레이션(V54)에서 처리.

    public List<String> getTags() {
        return tags == null ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(tags));
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Notice(String title, String summary, String content, String coverImageUrl, String linkUrl,
                   NoticeCategory category, String[] tags, NoticeVisibility visibility,
                   NoticeClubScopeRole clubScopeRole, boolean pinned, LocalDateTime expiresAt,
                   boolean notifyOnPublish,
                   LocalDateTime eventStartAt, LocalDateTime eventEndAt,
                   String location, String host, String audience, NoticeContentFormat contentFormat,
                   Long authorId) {
        this.title = title;
        this.summary = summary;
        this.content = content;
        this.coverImageUrl = coverImageUrl;
        this.linkUrl = linkUrl;
        this.category = category;
        this.tags = tags == null ? new String[0] : tags.clone();
        this.visibility = visibility;
        this.clubScopeRole = clubScopeRole;
        this.pinned = pinned;
        this.expiresAt = expiresAt;
        this.notifyOnPublish = notifyOnPublish;
        this.eventStartAt = eventStartAt;
        this.eventEndAt = eventEndAt;
        this.location = location;
        this.host = host;
        this.audience = audience;
        this.contentFormat = contentFormat == null ? NoticeContentFormat.MARKDOWN : contentFormat;
        this.authorId = authorId;
    }

    public static Notice create(String title, String summary, String content, String coverImageUrl,
                                String linkUrl, NoticeCategory category, List<String> tags,
                                NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
                                boolean pinned, LocalDateTime expiresAt, boolean notifyOnPublish,
                                LocalDateTime eventStartAt, LocalDateTime eventEndAt,
                                String location, String host, String audience, NoticeContentFormat contentFormat,
                                Long authorId) {
        validateScope(visibility, clubScopeRole);
        validateEventRange(eventStartAt, eventEndAt);
        boolean normalizedNotify = (visibility != NoticeVisibility.PUBLIC) || notifyOnPublish;
        String[] tagArray = tags == null
                ? new String[0]
                : tags.stream().distinct().toArray(String[]::new);
        return Notice.builder()
                .title(title).summary(summary).content(content)
                .coverImageUrl(coverImageUrl).linkUrl(linkUrl)
                .category(category).tags(tagArray)
                .visibility(visibility).clubScopeRole(clubScopeRole)
                .pinned(pinned).expiresAt(expiresAt)
                .notifyOnPublish(normalizedNotify)
                .eventStartAt(eventStartAt).eventEndAt(eventEndAt)
                .location(location).host(host).audience(audience)
                .contentFormat(contentFormat)
                .authorId(authorId)
                .build();
    }

    public record UpdatePayload(
            String title, String summary, String content, String coverImageUrl, String linkUrl,
            NoticeCategory category, List<String> tags,
            NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
            Boolean pinned, LocalDateTime expiresAt, Boolean clearExpiresAt,
            Boolean notifyOnPublish,
            LocalDateTime eventStartAt, LocalDateTime eventEndAt,
            String location, String host, String audience, Boolean clearEvent,
            NoticeContentFormat contentFormat
    ) {}

    public void update(UpdatePayload payload) {
        NoticeVisibility nextVisibility = payload.visibility() != null ? payload.visibility() : this.visibility;
        NoticeClubScopeRole nextRole;
        if (payload.visibility() != null) {
            nextRole = payload.clubScopeRole();
        } else if (payload.clubScopeRole() != null) {
            nextRole = payload.clubScopeRole();
        } else {
            nextRole = this.clubScopeRole;
        }
        validateScope(nextVisibility, nextRole);

        if (payload.title() != null) this.title = payload.title();
        if (payload.summary() != null) this.summary = payload.summary();
        if (payload.content() != null) this.content = payload.content();
        if (payload.coverImageUrl() != null) this.coverImageUrl = payload.coverImageUrl();
        if (payload.linkUrl() != null) this.linkUrl = payload.linkUrl();
        if (payload.category() != null) this.category = payload.category();
        if (payload.tags() != null) this.tags = payload.tags().stream().distinct().toArray(String[]::new);
        if (payload.visibility() != null) {
            this.visibility = nextVisibility;
            this.clubScopeRole = nextRole;
            if (nextVisibility != NoticeVisibility.PUBLIC) this.notifyOnPublish = true;
        } else if (payload.clubScopeRole() != null) {
            this.clubScopeRole = nextRole;
        }
        if (payload.pinned() != null) this.pinned = payload.pinned();
        if (Boolean.TRUE.equals(payload.clearExpiresAt())) this.expiresAt = null;
        else if (payload.expiresAt() != null) this.expiresAt = payload.expiresAt();
        if (payload.notifyOnPublish() != null && this.visibility == NoticeVisibility.PUBLIC) {
            this.notifyOnPublish = payload.notifyOnPublish();
        }
        boolean clearEvent = Boolean.TRUE.equals(payload.clearEvent());
        LocalDateTime nextEventStart = clearEvent ? null
                : (payload.eventStartAt() != null ? payload.eventStartAt() : this.eventStartAt);
        LocalDateTime nextEventEnd = clearEvent ? null
                : (payload.eventEndAt() != null ? payload.eventEndAt() : this.eventEndAt);
        validateEventRange(nextEventStart, nextEventEnd);
        if (clearEvent) {
            this.eventStartAt = null;
            this.eventEndAt = null;
            this.location = null;
            this.host = null;
            this.audience = null;
        } else {
            if (payload.eventStartAt() != null) this.eventStartAt = payload.eventStartAt();
            if (payload.eventEndAt() != null) this.eventEndAt = payload.eventEndAt();
            if (payload.location() != null) this.location = payload.location();
            if (payload.host() != null) this.host = payload.host();
            if (payload.audience() != null) this.audience = payload.audience();
        }
        if (payload.contentFormat() != null) {
            this.contentFormat = payload.contentFormat();
        }
    }

    /** LEADER/OFFICER 의 CLUB_SCOPED 공지 부분 수정 — null 필드는 건너뛴다. */
    public void applyClubScopedUpdate(String title, String summary, String content,
                                      String coverImageUrl, Boolean pinned,
                                      java.time.LocalDateTime expiresAt) {
        if (title != null) this.title = title;
        if (summary != null) this.summary = summary;
        if (content != null) this.content = content;
        if (coverImageUrl != null) this.coverImageUrl = coverImageUrl;
        if (pinned != null) this.pinned = pinned;
        if (expiresAt != null) this.expiresAt = expiresAt;
    }

    private static void validateScope(NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole) {
        if (visibility == NoticeVisibility.CLUB_SCOPED && clubScopeRole == null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 공지는 club_scope_role 이 필요합니다.");
        }
        if (visibility != NoticeVisibility.CLUB_SCOPED && clubScopeRole != null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 가 아닌 공지에는 club_scope_role 을 둘 수 없습니다.");
        }
    }

    private static void validateEventRange(LocalDateTime start, LocalDateTime end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new NoticeException.InvalidNoticeEventException("종료 일시가 시작 일시보다 빠를 수 없습니다.");
        }
    }
}
