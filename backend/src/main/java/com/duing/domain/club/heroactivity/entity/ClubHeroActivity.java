package com.duing.domain.club.heroactivity.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "club_hero_activity")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_hero_activity SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubHeroActivity extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_photo_id", nullable = false)
    private ClubPhoto clubPhoto;

    @Column(nullable = false, length = 30)
    private String title;

    @Column(nullable = false, length = 80)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubHeroActivity(Club club, ClubPhoto clubPhoto, String title,
                             String description, int displayOrder) {
        this.club = club;
        this.clubPhoto = clubPhoto;
        this.title = title;
        this.description = description;
        this.displayOrder = displayOrder;
    }

    public static ClubHeroActivity create(Club club, ClubPhoto clubPhoto, String title,
                                          String description, int displayOrder) {
        return ClubHeroActivity.builder()
                .club(club)
                .clubPhoto(clubPhoto)
                .title(title)
                .description(description)
                .displayOrder(displayOrder)
                .build();
    }

    /** 부분 수정 — null 은 미변경. */
    public void updateContent(String title, String description) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
    }

    public void changePhoto(ClubPhoto clubPhoto) {
        this.clubPhoto = clubPhoto;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
