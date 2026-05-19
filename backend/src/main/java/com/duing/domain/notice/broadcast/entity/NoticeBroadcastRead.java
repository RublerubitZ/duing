package com.duing.domain.notice.broadcast.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "notice_broadcast_read")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NoticeBroadcastRead {

    @EmbeddedId
    private NoticeBroadcastReadId id;

    @Column(name = "read_at", nullable = false)
    private LocalDateTime readAt;

    public NoticeBroadcastRead(Long broadcastId, Long userId) {
        this.id = new NoticeBroadcastReadId(broadcastId, userId);
        this.readAt = LocalDateTime.now();
    }

    public Long getBroadcastId() {
        return id.getBroadcastId();
    }

    public Long getUserId() {
        return id.getUserId();
    }

    @Embeddable
    @Getter
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    public static class NoticeBroadcastReadId implements Serializable {
        @Column(name = "broadcast_id")
        private Long broadcastId;

        @Column(name = "user_id")
        private Long userId;

        public NoticeBroadcastReadId(Long broadcastId, Long userId) {
            this.broadcastId = broadcastId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof NoticeBroadcastReadId other)) return false;
            return Objects.equals(broadcastId, other.broadcastId)
                    && Objects.equals(userId, other.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(broadcastId, userId);
        }
    }
}
