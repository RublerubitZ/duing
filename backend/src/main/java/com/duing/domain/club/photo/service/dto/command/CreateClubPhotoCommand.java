package com.duing.domain.club.photo.service.dto.command;

public record CreateClubPhotoCommand(
        Long clubId,
        Long requesterId,
        String storageKey,
        String caption,
        Integer width,
        Integer height
) {}
