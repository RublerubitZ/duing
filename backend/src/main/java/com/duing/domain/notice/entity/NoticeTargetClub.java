package com.duing.domain.notice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "notice_target_club")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NoticeTargetClub {

    @EmbeddedId
    private NoticeTargetClubId id;

    public NoticeTargetClub(Long noticeId, Long clubId) {
        this.id = new NoticeTargetClubId(noticeId, clubId);
    }

    public Long getNoticeId() { return id.getNoticeId(); }
    public Long getClubId() { return id.getClubId(); }

    @Embeddable
    @Getter
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    public static class NoticeTargetClubId implements Serializable {
        @Column(name = "notice_id") private Long noticeId;
        @Column(name = "club_id")   private Long clubId;

        public NoticeTargetClubId(Long noticeId, Long clubId) {
            this.noticeId = noticeId; this.clubId = clubId;
        }

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof NoticeTargetClubId other)) return false;
            return Objects.equals(noticeId, other.noticeId) && Objects.equals(clubId, other.clubId);
        }
        @Override public int hashCode() { return Objects.hash(noticeId, clubId); }
    }
}
