package com.duing.domain.recruitment.service.dto.command;

import java.time.LocalDate;
import java.util.List;

/**
 * 모집 공고 수정 명령. null 필드는 "변경 없음" 을 뜻한다.
 * questions(legacy)와 questionItems(구조화)는 배타적이며, 둘 다 비어 있지 않으면 서비스가 400 으로 거부한다.
 */
public record UpdateRecruitmentCommand(
        Long recruitmentId,
        Long currentUserId,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        Integer capacity,
        Boolean useInterview,
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거
        List<String> questions,
        List<QuestionItemCommand> questionItems,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        Boolean showApplicantCount
) {}
