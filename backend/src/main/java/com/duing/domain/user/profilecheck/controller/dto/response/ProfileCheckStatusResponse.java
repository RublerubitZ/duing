package com.duing.domain.user.profilecheck.controller.dto.response;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.service.dto.query.ProfileCheckStatusQuery;

public record ProfileCheckStatusResponse(
        boolean pending,
        Integer semesterYear,
        Integer semesterTerm,
        String title,
        String message,
        Grade grade,
        College college,
        String major,
        Grade suggestedGrade
) {
    public static ProfileCheckStatusResponse from(ProfileCheckStatusQuery query) {
        Semester semester = query.semester();
        return new ProfileCheckStatusResponse(
                query.pending(),
                semester == null ? null : semester.year(),
                semester == null ? null : semester.term(),
                query.title(),
                query.message(),
                query.grade(),
                query.college(),
                query.major(),
                query.suggestedGrade());
    }
}
