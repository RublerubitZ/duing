package com.duing.domain.globalevent.service.dto.query;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.user.entity.User;
import com.duing.global.constant.AdminLabels;
import java.time.LocalDateTime;

public record GlobalEventAdminDetailQuery(
        Long id,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        String coverImageUrl,
        GlobalEventCategory category,
        CreatorRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    /**
     * @param creator 탈퇴(soft delete) 등으로 조회되지 않으면 null — 이름 자리만 삭제 라벨로 채운다.
     */
    public static GlobalEventAdminDetailQuery of(GlobalEvent event, User creator) {
        return new GlobalEventAdminDetailQuery(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(),
                event.getCoverImageUrl(),
                event.getCategory(),
                resolveCreatorRef(event.getCreatedBy(), creator),
                event.getCreatedAt(), event.getUpdatedAt());
    }

    private static CreatorRef resolveCreatorRef(Long createdBy, User creator) {
        // id 는 항상 행사에 적힌 원본을 쓴다 — 이름만 해석되지 않을 뿐 참조 자체는 살아 있다.
        if (creator == null) return new CreatorRef(createdBy, AdminLabels.DELETED);
        return new CreatorRef(creator.getId(), creator.getName());
    }
}
