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

    public List<String> getTags() {
        return tags == null ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(tags));
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Notice(String title, String summary, String content, String coverImageUrl, String linkUrl,
                   NoticeCategory category, String[] tags, NoticeVisibility visibility,
                   NoticeClubScopeRole clubScopeRole, boolean pinned, LocalDateTime expiresAt,
                   boolean notifyOnPublish, Long authorId) {
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
        this.authorId = authorId;
    }

    public static Notice create(String title, String summary, String content, String coverImageUrl,
                                String linkUrl, NoticeCategory category, List<String> tags,
                                NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
                                boolean pinned, LocalDateTime expiresAt, boolean notifyOnPublish,
                                Long authorId) {
        validateScope(visibility, clubScopeRole);
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
                .notifyOnPublish(normalizedNotify).authorId(authorId)
                .build();
    }

    public record UpdatePayload(
            String title, String summary, String content, String coverImageUrl, String linkUrl,
            NoticeCategory category, List<String> tags,
            NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
            Boolean pinned, LocalDateTime expiresAt, Boolean clearExpiresAt,
            Boolean notifyOnPublish
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
    }

    private static void validateScope(NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole) {
        if (visibility == NoticeVisibility.CLUB_SCOPED && clubScopeRole == null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 공지는 club_scope_role 이 필요합니다.");
        }
        if (visibility != NoticeVisibility.CLUB_SCOPED && clubScopeRole != null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 가 아닌 공지에는 club_scope_role 을 둘 수 없습니다.");
        }
    }
}
