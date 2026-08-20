package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
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
        AssignedInterviewResponse interview,
        Instant submittedAt,
        List<StatusHistoryItem> statusHistory,
        ApplicationEvaluationItem myEvaluation,
        List<ApplicationEvaluationItem> otherEvaluations,
        List<AvailabilityItemResponse> interviewAvailabilities,
        AvailabilityItemResponse assignedSlot,
        InterviewRoundBrief interviewRound
) {

    public record ApplicantInfo(Long userId, String name, String studentId,
                                College college, String major, Grade grade, String phone) {}

    public record QuestionAnswer(String question, String answer) {}

    public record StatusHistoryItem(
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            Long changedById,
            String changedByName,
            Instant changedAt
    ) {}

    public record ApplicationEvaluationItem(
            Long evaluatorId,
            String evaluatorName,
            Integer score,
            String memo,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record AvailabilityItemResponse(
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {}

    /**
     * 운영진 화면에 노출하는 placement-active 라운드 요약.
     * placement-active 멤버십이 없으면 {@code null} (= 대기열/선정 전).
     * {@code unresponded} 는 파생값 — INVITED && now > availabilityDeadline (§5.3).
     * {@code alternativeAvailabilityText} 는 NO_AVAILABLE_SLOT 일 때만 의미를 가지며 그 외엔 {@code null}.
     */
    public record InterviewRoundBrief(
            Long roundId,
            String title,
            RoundStatus roundStatus,
            RoundMemberStatus memberStatus,
            boolean unresponded,
            String alternativeAvailabilityText
    ) {}

    public static ApplicantDetailResponse from(ApplicantDetailQuery detailQuery) {
        ApplicantInfo applicantInfo = new ApplicantInfo(
                detailQuery.applicant().userId(),
                detailQuery.applicant().name(),
                detailQuery.applicant().studentId(),
                detailQuery.applicant().college(),
                detailQuery.applicant().major(),
                detailQuery.applicant().grade(),
                detailQuery.applicant().phone()
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
                        TimeMapper.systemWallClockToInstant(item.changedAt())))
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

        AssignedInterviewResponse interview = AssignedInterviewResponse.from(detailQuery.interview());

        InterviewRoundBrief interviewRound = detailQuery.interviewRound() == null ? null
                : new InterviewRoundBrief(
                        detailQuery.interviewRound().roundId(),
                        detailQuery.interviewRound().title(),
                        detailQuery.interviewRound().roundStatus(),
                        detailQuery.interviewRound().memberStatus(),
                        detailQuery.interviewRound().unresponded(),
                        detailQuery.interviewRound().alternativeAvailabilityText());

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
                TimeMapper.systemWallClockToInstant(detailQuery.submittedAt()),
                history,
                myEvaluation,
                otherEvaluations,
                availabilities,
                assignedSlot,
                interviewRound
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
                TimeMapper.systemWallClockToInstant(evaluationItemQuery.createdAt()),
                TimeMapper.systemWallClockToInstant(evaluationItemQuery.updatedAt())
        );
    }
}
