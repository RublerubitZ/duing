package com.duing.domain.club.heroactivity.service.dto.command;

/** 전부 null 은 미변경(부분 수정). */
public record UpdateHeroActivityCommand(
        Long clubId,
        Long requesterId,
        Long heroActivityId,
        Long clubPhotoId,
        String title,
        String description
) {}
