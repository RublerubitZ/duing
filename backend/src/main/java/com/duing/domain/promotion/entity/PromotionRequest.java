package com.duing.domain.promotion.entity;

import com.duing.domain.promotion.exception.PromotionException;
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
@Table(name = "promotion_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE promotion_request SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class PromotionRequest extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "requester_user_id", nullable = false) private Long requesterUserId;

    @Column(nullable = false, length = 80) private String title;
    @Column(nullable = false, columnDefinition = "TEXT") private String description;

    @Column(name = "suggested_banner_image_url", length = 500) private String suggestedBannerImageUrl;
    @Column(name = "suggested_link_url", columnDefinition = "TEXT") private String suggestedLinkUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private PromotionRequestStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PromotionRequest(Long clubId, Long requesterUserId,
                             String title, String description,
                             String suggestedBannerImageUrl, String suggestedLinkUrl) {
        this.clubId = clubId;
        this.requesterUserId = requesterUserId;
        this.title = title;
        this.description = description;
        this.suggestedBannerImageUrl = suggestedBannerImageUrl;
        this.suggestedLinkUrl = suggestedLinkUrl;
        this.status = PromotionRequestStatus.PENDING;
    }

    public static PromotionRequest create(Long clubId, Long requesterUserId,
                                          String title, String description,
                                          String suggestedBannerImageUrl, String suggestedLinkUrl) {
        return PromotionRequest.builder()
                .clubId(clubId).requesterUserId(requesterUserId)
                .title(title).description(description)
                .suggestedBannerImageUrl(suggestedBannerImageUrl)
                .suggestedLinkUrl(suggestedLinkUrl)
                .build();
    }

    public void process(Long handlerUserId, PromotionRequestStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == PromotionRequestStatus.PENDING) {
            throw new PromotionException.InvalidPromotionRequestTransitionException(
                    "처리 결과는 ACCEPTED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new PromotionException.InvalidPromotionRequestTransitionException("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
