package com.duing.domain.user.profilecheck.service.dto.query;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.profilecheck.entity.Semester;

public record ProfileCheckStatusQuery(
        boolean pending,
        Semester semester,
        String title,
        String message,
        Grade grade,
        College college,
        String major,
        Grade suggestedGrade
) {
    /** 띄울 팝업이 없다 — 나머지 필드는 모두 null. */
    public static ProfileCheckStatusQuery none() {
        return new ProfileCheckStatusQuery(false, null, null, null, null, null, null, null);
    }
}
