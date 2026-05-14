package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import java.time.LocalDate;
import java.util.List;

public record RecruitmentDetailResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        boolean effectivelyOpen,
        List<String> questions
) {
    public static RecruitmentDetailResponse from(RecruitmentDetailQuery detailQuery) {
        return new RecruitmentDetailResponse(
                detailQuery.id(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.title(),
                detailQuery.content(),
                detailQuery.startDate(),
                detailQuery.endDate(),
                detailQuery.capacity(),
                detailQuery.status(),
                detailQuery.effectivelyOpen(),
                detailQuery.questions()
        );
    }
}
