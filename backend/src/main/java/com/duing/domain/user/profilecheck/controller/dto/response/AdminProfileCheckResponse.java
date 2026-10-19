package com.duing.domain.user.profilecheck.controller.dto.response;

import com.duing.domain.user.profilecheck.service.dto.query.AdminProfileCheckQuery;

public record AdminProfileCheckResponse(
        boolean enabled,
        int semesterYear,
        int semesterTerm,
        int currentSemesterYear,
        int currentSemesterTerm,
        String title,
        String message,
        long targetCount,
        long confirmedCount,
        long unconfirmedCount
) {
    public static AdminProfileCheckResponse from(AdminProfileCheckQuery query) {
        return new AdminProfileCheckResponse(
                query.enabled(),
                query.semester().year(),
                query.semester().term(),
                query.currentSemester().year(),
                query.currentSemester().term(),
                query.title(),
                query.message(),
                query.counts().targetCount(),
                query.counts().confirmedCount(),
                query.counts().unconfirmedCount());
    }
}
