package com.duing.domain.recruitment.service.dto.command;

import java.time.LocalDate;
import java.util.List;

public record CreateRecruitmentCommand(
        Long clubId,
        Long currentUserId,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        List<String> questions
) {}
