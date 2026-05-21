package com.duing.domain.promotion.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "promotion")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE promotion SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Promotion extends BaseEntity {

    @Column(name = "club_id") private Long clubId;
    @Column(nullable = false, length = 120) private String title;
    @Column(name = "banner_image_url", nullable = false, length = 500) private String bannerImageUrl;
    @Column(name = "link_url", columnDefinition = "TEXT") private String linkUrl;
    @Column(nullable = false) private boolean active;
    @Column(name = "display_order", nullable = false) private int displayOrder;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private Promotion(Long clubId, String title, String bannerImageUrl, String linkUrl,
                      boolean active, int displayOrder, Long createdBy) {
        this.clubId = clubId;
        this.title = title;
        this.bannerImageUrl = bannerImageUrl;
        this.linkUrl = linkUrl;
        this.active = active;
        this.displayOrder = displayOrder;
        this.createdBy = createdBy;
    }

    public static Promotion create(Long clubId, String title, String bannerImageUrl, String linkUrl,
                                   boolean active, int displayOrder, Long createdBy) {
        return Promotion.builder()
                .clubId(clubId).title(title).bannerImageUrl(bannerImageUrl).linkUrl(linkUrl)
                .active(active).displayOrder(displayOrder).createdBy(createdBy)
                .build();
    }

    public record UpdatePayload(
            String title,
            String bannerImageUrl,
            String linkUrl,
            Long clubId,
            Boolean active,
            Integer displayOrder,
            Boolean clearClubId
    ) {}

    public void update(UpdatePayload payload) {
        if (payload.title() != null) this.title = payload.title();
        if (payload.bannerImageUrl() != null) this.bannerImageUrl = payload.bannerImageUrl();
        if (payload.linkUrl() != null) this.linkUrl = payload.linkUrl();
        if (Boolean.TRUE.equals(payload.clearClubId())) {
            this.clubId = null;
        } else if (payload.clubId() != null) {
            this.clubId = payload.clubId();
        }
        if (payload.active() != null) this.active = payload.active();
        if (payload.displayOrder() != null) this.displayOrder = payload.displayOrder();
    }
}
