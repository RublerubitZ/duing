package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.user.entity.User;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDateTime;

public record ClubEventDetailResponse(
        Long id, Long clubId, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location,
        CreatorRef createdBy, Instant createdAt, Instant updatedAt
) {
    private static final String WITHDRAWN_CREATOR_NAME = "탈퇴한 회원";

    public record CreatorRef(Long id, String name) {}

    /**
     * @param creator 작성자가 탈퇴(soft delete)해 조회되지 않으면 null — 이름 자리만 "탈퇴한 회원" 으로 채운다.
     */
    public static ClubEventDetailResponse from(ClubEvent event, User creator) {
        return new ClubEventDetailResponse(
                event.getId(), event.getClubId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(), event.getLocation(),
                resolveCreatorRef(event.getCreatedBy(), creator),
                TimeMapper.systemWallClockToInstant(event.getCreatedAt()),
                TimeMapper.systemWallClockToInstant(event.getUpdatedAt())
        );
    }

    private static CreatorRef resolveCreatorRef(Long createdBy, User creator) {
        // id 는 일정에 적힌 원본을 쓴다 — 이름만 숨길 뿐 참조 자체는 살아 있다.
        if (creator == null) return new CreatorRef(createdBy, WITHDRAWN_CREATOR_NAME);
        return new CreatorRef(creator.getId(), creator.getName());
    }
}
