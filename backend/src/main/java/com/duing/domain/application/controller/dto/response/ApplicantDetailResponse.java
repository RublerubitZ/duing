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
        AssignedInterview interview,
        LocalDateTime submittedAt,
        List<StatusHistoryItem> statusHistory,
        ApplicationEvaluationItem myEvaluation,
        List<ApplicationEvaluationItem> otherEvaluations,
        List<AvailabilityItemResponse> interviewAvailabilities,
        AvailabilityItemResponse assignedSlot
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

    public record ApplicationEvaluationItem(
            Long evaluatorId,
            String evaluatorName,
            Integer score,
            String memo,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public record AvailabilityItemResponse(
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {}

    /**
     * 운영진 상세 카드에서 노출하는 현재 배정 면접 일정/장소.
     * ASSIGNED schedule 이 있으면 채워지고, 미배정/CANCELLED 만 있으면 응답에서 {@code null}.
     * <p>
     * {@code location} 은 nullable — {@link com.duing.domain.interview.entity.InterviewRound} 의 location
     * 이 비어 있는 라운드는 interview 객체는 노출하되 location 만 {@code null} 로 채운다 (Codex review BE-3).
     */
    public record AssignedInterview(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location
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

        ApplicationEvaluationItem myEvaluation = detailQuery.myEvaluation() == null ? null
                : toEvaluationItem(detailQuery.myEvaluation());

        List<ApplicationEvaluationItem> otherEvaluations = detailQuery.otherEvaluations().stream()
                .map(ApplicantDetailResponse::toEvaluationItem)
                .toList();

        List<AvailabilityItemResponse> availabilities = detailQuery.interviewAvailabilities().stream()
                .map(ApplicantDetailResponse::toAvailabilityItem)
                .toList();
        AvailabilityItemResponse assignedSlot = detailQuery.assignedSlot() == null ? null
                : toAvailabilityItem(detailQuery.assignedSlot());

        AssignedInterview interview = detailQuery.interview() == null ? null
                : new AssignedInterview(
                        detailQuery.interview().startAt(),
                        detailQuery.interview().endAt(),
                        detailQuery.interview().location());

        return new ApplicantDetailResponse(
                detailQuery.applicationId(),
                detailQuery.recruitmentId(),
                detailQuery.recruitmentTitle(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                applicantInfo,
                questionAnswers,
                detailQuery.status(),
                interview,
                detailQuery.submittedAt(),
                history,
                myEvaluation,
                otherEvaluations,
                availabilities,
                assignedSlot
        );
    }

    private static AvailabilityItemResponse toAvailabilityItem(
            ApplicantDetailQuery.AvailabilityItem availabilityItem) {
        return new AvailabilityItemResponse(
                availabilityItem.slotId(),
                availabilityItem.startTime(),
                availabilityItem.endTime()
        );
    }

    private static ApplicationEvaluationItem toEvaluationItem(
            ApplicantDetailQuery.EvaluationItemQuery evaluationItemQuery) {
        return new ApplicationEvaluationItem(
                evaluationItemQuery.evaluatorId(),
                evaluationItemQuery.evaluatorName(),
                evaluationItemQuery.score(),
                evaluationItemQuery.memo(),
                evaluationItemQuery.createdAt(),
                evaluationItemQuery.updatedAt()
        );
    }
}
