package com.duing.domain.recruitment.service.dto.command;

import java.time.LocalDate;
import java.util.List;

public record UpdateRecruitmentCommand(
        Long recruitmentId,
        Long currentUserId,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        Integer capacity,
        Boolean useInterview,
        List<String> questions
) {}