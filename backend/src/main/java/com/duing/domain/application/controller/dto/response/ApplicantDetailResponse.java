package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantDetailResponse(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicantInfo applicant,
        List<QuestionAnswer> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        List<StatusHistoryItem> statusHistory
) {

    public record ApplicantInfo(Long userId, String name, String studentId, String email) {}

    public record QuestionAnswer(String question, String answer) {}

    public record StatusHistoryItem(
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            Long changedById,
            String changedByName,
            LocalDateTime changedAt
    ) {}

    public static ApplicantDetailResponse from(ApplicantDetailQuery detailQuery) {
        ApplicantInfo applicantInfo = new ApplicantInfo(
                detailQuery.applicant().userId(),
                detailQuery.applicant().name(),
                detailQuery.applicant().studentId(),
                detailQuery.applicant().email()
        );

        List<QuestionAnswer> questionAnswers = detailQuery.answers().stream()
                .map(qa -> new QuestionAnswer(qa.question(), qa.answer()))
                .toList();

        List<StatusHistoryItem> history = detailQuery.statusHistory().stream()
                .map(item -> new StatusHistoryItem(
                        item.previousStatus(),
                        item.newStatus(),
                        item.changedById(),
                        item.changedByName(),
                        item.changedAt()))
                .toList();

        return new ApplicantDetailResponse(
                detailQuery.applicationId(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                applicantInfo,
                questionAnswers,
                detailQuery.status(),
                detailQuery.interviewAt(),
                detailQuery.interviewLocation(),
                detailQuery.submittedAt(),
                history
        );
    }
}
