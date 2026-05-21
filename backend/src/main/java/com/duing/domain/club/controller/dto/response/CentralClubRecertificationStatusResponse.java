package com.duing.domain.club.controller.dto.response;

public record CentralClubRecertificationStatusResponse(
        Long clubId,
        String clubName,
        boolean centralClub,
        Integer lastVerifiedYear,
        boolean expired
) {}
