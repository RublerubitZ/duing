package com.duing.domain.club.heroactivity.service.dto.command;

public record CreateHeroActivityCommand(
        Long clubId,
        Long requesterId,
        Long clubPhotoId,
        String title,
        String description,
        int displayOrder
) {}
