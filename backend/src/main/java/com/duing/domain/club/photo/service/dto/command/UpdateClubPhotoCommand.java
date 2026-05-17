package com.duing.domain.club.photo.service.dto.command;

public record UpdateClubPhotoCommand(
        Long clubId,
        Long requesterId,
        Long photoId,
        String caption
) {}