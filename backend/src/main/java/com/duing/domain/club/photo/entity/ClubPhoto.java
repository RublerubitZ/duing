package com.duing.domain.club.photo.entity;

import com.duing.domain.club.entity.Club;
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
@Table(name = "club_photo")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_photo SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubPhoto extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(length = 200)
    private String caption;

    @Column
    private Integer width;

    @Column
    private Integer height;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubPhoto(Club club, String storageKey, String caption,
                      Integer width, Integer height, int displayOrder) {
        this.club = club;
        this.storageKey = storageKey;
        this.caption = caption;
        this.width = width;
        this.height = height;
        this.displayOrder = displayOrder;
    }

    public static ClubPhoto create(Club club, String storageKey, String caption,
                                   Integer width, Integer height, int displayOrder) {
        return ClubPhoto.builder()
                .club(club)
                .storageKey(storageKey)
                .caption(caption)
                .width(width)
                .height(height)
                .displayOrder(displayOrder)
                .build();
    }

    public void updateMeta(String caption, int displayOrder) {
        this.caption = caption;
        this.displayOrder = displayOrder;
    }

    public void updateCaption(String caption) {
        this.caption = caption;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
