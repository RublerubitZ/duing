package com.duing.domain.promotion.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
    @Column(name = "banner_image_url", length = 500) private String bannerImageUrl;
    @Column(name = "link_url", columnDefinition = "TEXT") private String linkUrl;
    @Column(nullable = false) private boolean active;
    @Column(name = "display_order", nullable = false) private int displayOrder;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    @Column(length = 60) private String tag;
    @Column(length = 200) private String subtitle;
    @Column(name = "cta_label", length = 40) private String ctaLabel;
    @Column(length = 8) private String emoji;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PromotionPalette palette;

    @Builder(access = AccessLevel.PRIVATE)
    private Promotion(Long clubId, String title, String bannerImageUrl, String linkUrl,
                      boolean active, int displayOrder, Long createdBy,
                      String tag, String subtitle, String ctaLabel, String emoji,
                      PromotionPalette palette) {
        this.clubId = clubId;
        this.title = title;
        this.bannerImageUrl = bannerImageUrl;
        this.linkUrl = linkUrl;
        this.active = active;
        this.displayOrder = displayOrder;
        this.createdBy = createdBy;
        this.tag = tag;
        this.subtitle = subtitle;
        this.ctaLabel = ctaLabel;
        this.emoji = emoji;
        this.palette = palette;
    }

    public static Promotion create(Long clubId, String title, String bannerImageUrl, String linkUrl,
                                   boolean active, int displayOrder, Long createdBy,
                                   String tag, String subtitle, String ctaLabel, String emoji,
                                   PromotionPalette palette) {
        return Promotion.builder()
                .clubId(clubId).title(title).bannerImageUrl(bannerImageUrl).linkUrl(linkUrl)
                .active(active).displayOrder(displayOrder).createdBy(createdBy)
                .tag(tag).subtitle(subtitle).ctaLabel(ctaLabel).emoji(emoji)
                .palette(palette == null ? PromotionPalette.INK : palette)
                .build();
    }

    public record UpdatePayload(
            String title,
            String bannerImageUrl,
            String linkUrl,
            Long clubId,
            Boolean active,
            Integer displayOrder,
            Boolean clearClubId,
            String tag,
            String subtitle,
            String ctaLabel,
            String emoji,
            PromotionPalette palette,
            Boolean clearBannerImageUrl,
            Boolean clearTag,
            Boolean clearSubtitle,
            Boolean clearCtaLabel,
            Boolean clearEmoji
    ) {}

    public void update(UpdatePayload payload) {
        if (payload.title() != null) this.title = payload.title();
        if (Boolean.TRUE.equals(payload.clearBannerImageUrl())) {
            this.bannerImageUrl = null;
        } else if (payload.bannerImageUrl() != null) {
            this.bannerImageUrl = payload.bannerImageUrl();
        }
        if (payload.linkUrl() != null) this.linkUrl = payload.linkUrl();
        if (Boolean.TRUE.equals(payload.clearClubId())) {
            this.clubId = null;
        } else if (payload.clubId() != null) {
            this.clubId = payload.clubId();
        }
        if (payload.active() != null) this.active = payload.active();
        if (payload.displayOrder() != null) this.displayOrder = payload.displayOrder();

        if (Boolean.TRUE.equals(payload.clearTag())) this.tag = null;
        else if (payload.tag() != null) this.tag = payload.tag();
        if (Boolean.TRUE.equals(payload.clearSubtitle())) this.subtitle = null;
        else if (payload.subtitle() != null) this.subtitle = payload.subtitle();
        if (Boolean.TRUE.equals(payload.clearCtaLabel())) this.ctaLabel = null;
        else if (payload.ctaLabel() != null) this.ctaLabel = payload.ctaLabel();
        if (Boolean.TRUE.equals(payload.clearEmoji())) this.emoji = null;
        else if (payload.emoji() != null) this.emoji = payload.emoji();

        if (payload.palette() != null) this.palette = payload.palette();
    }
}
