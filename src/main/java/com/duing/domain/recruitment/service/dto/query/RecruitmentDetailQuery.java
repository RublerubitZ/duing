package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDate;
import java.util.List;

public record RecruitmentDetailQuery(
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
    public static RecruitmentDetailQuery from(Recruitment recruitment, LocalDate today) {
        List<String> questions = recruitment.getForm() != null
                ? recruitment.getForm().getQuestions()
                : List.of();
        return new RecruitmentDetailQuery(
                recruitment.getId(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                recruitment.getTitle(),
                recruitment.getContent(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                recruitment.getCapacity(),
                recruitment.getStatus(),
                recruitment.isEffectivelyOpen(today),
                questions
        );
    }
}
