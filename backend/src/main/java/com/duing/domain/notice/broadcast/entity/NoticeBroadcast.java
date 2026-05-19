package com.duing.domain.notice.broadcast.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "notice_broadcast")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE notice_broadcast SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class NoticeBroadcast {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notice_id", nullable = false, unique = true)
    private Long noticeId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 300)
    private String body;

    @Column(name = "link_url", length = 300)
    private String linkUrl;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public static NoticeBroadcast snapshot(
        Long noticeId, String title, String body, String linkUrl
    ) {
        NoticeBroadcast broadcast = new NoticeBroadcast();
        broadcast.noticeId = noticeId;
        broadcast.title = title;
        broadcast.body = body;
        broadcast.linkUrl = linkUrl;
        broadcast.createdAt = LocalDateTime.now();
        return broadcast;
    }
}
