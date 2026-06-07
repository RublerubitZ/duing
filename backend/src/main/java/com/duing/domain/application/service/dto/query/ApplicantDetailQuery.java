package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;

public record ApplicantDetailQuery(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicantInfoQuery applicant,
        List<QuestionAnswerQuery> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        List<StatusHistoryItemQuery> statusHistory,
        EvaluationItemQuery myEvaluation,
        List<EvaluationItemQuery> otherEvaluations
) {

    public record ApplicantInfoQuery(Long userId, String name, String studentId, String email) {}

    public record QuestionAnswerQuery(String question, String answer) {}

    public record StatusHistoryItemQuery(
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            Long changedById,
            String changedByName,
            LocalDateTime changedAt
    ) {}

    public record EvaluationItemQuery(
            Long evaluatorId,
            String evaluatorName,
            Integer score,
            String memo,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    /**
     * 기존 호출자 backward-compatibility 유지 — history/evaluation 없이 위임한다.
     */
    public static ApplicantDetailQuery from(Application application) {
        return fromWithHistory(application, List.of());
    }

    /**
     * history 포함, evaluation 미포함 단축 메서드.
     * 기존 호출자(서비스, 테스트)의 backward-compatibility 를 유지한다.
     */
    public static ApplicantDetailQuery fromWithHistory(Application application,
                                                       List<ApplicationStatusHistory> historyRows) {
        return fromAll(application, historyRows, List.of(), null);
    }

    /**
     * 전체 필드를 포함하는 최종 팩토리 메서드.
     * currentUserId 기준으로 myEvaluation / otherEvaluations 를 분리한다.
     * currentUserId 가 null 이면 모든 평가를 otherEvaluations 에 배치한다.
     */
    public static ApplicantDetailQuery fromAll(Application application,
                                               List<ApplicationStatusHistory> historyRows,
                                               List<ApplicationEvaluation> allEvaluations,
                                               Long currentUserId) {
        Recruitment recruitment = application.getRecruitment();
        User applicationUser = application.getUser();

        ApplicantInfoQuery applicantInfo = new ApplicantInfoQuery(
                applicationUser.getId(),
                applicationUser.getName(),
                applicationUser.getStudentId(),
                applicationUser.getEmail()
        );

        List<QuestionAnswerQuery> pairedAnswers = buildPairedAnswers(recruitment, application);
        Club club = recruitment.getClub();

        List<StatusHistoryItemQuery> statusHistory = historyRows.stream()
                .map(row -> new StatusHistoryItemQuery(
                        row.getPreviousStatus(),
                        row.getNewStatus(),
                        row.getChangedBy().getId(),
                        row.getChangedBy().getName(),
                        row.getCreatedAt()
                ))
                .toList();

        EvaluationItemQuery myEvaluation = allEvaluations.stream()
                .filter(evaluation -> currentUserId != null
                        && evaluation.getEvaluator().getId().equals(currentUserId))
                .findFirst()
                .map(ApplicantDetailQuery::toEvaluationItem)
                .orElse(null);

        List<EvaluationItemQuery> otherEvaluations = allEvaluations.stream()
                .filter(evaluation -> currentUserId == null
                        || !evaluation.getEvaluator().getId().equals(currentUserId))
                .map(ApplicantDetailQuery::toEvaluationItem)
                .toList();

        return new ApplicantDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                applicantInfo,
                pairedAnswers,
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt(),
                statusHistory,
                myEvaluation,
                otherEvaluations
        );
    }

    private static EvaluationItemQuery toEvaluationItem(ApplicationEvaluation evaluation) {
        return new EvaluationItemQuery(
                evaluation.getEvaluator().getId(),
                evaluation.getEvaluator().getName(),
                evaluation.getScore(),
                evaluation.getMemo(),
                evaluation.getCreatedAt(),
                evaluation.getUpdatedAt()
        );
    }

    private static List<QuestionAnswerQuery> buildPairedAnswers(Recruitment recruitment, Application application) {
        if (recruitment.getApplicationMode() == ApplicationMode.EXTERNAL) {
            // 외부 폼 모집은 du-ing 에 답변이 없으므로 빈 목록 반환
            return List.of();
        }

        RecruitmentForm form = recruitment.getForm();
        List<String> questions = form == null ? List.of() : form.getQuestions();
        List<String> applicationAnswers = application.getAnswers();

        // 질문 수와 답변 수가 다를 경우 짧은 쪽 길이까지만 매핑한다.
        // (데이터 불일치 방어 — 정상 제출 시에는 동일 길이가 보장되지만,
        // 폼 편집 이후 기존 지원서가 남아 있을 수 있는 엣지케이스를 위해)
        int pairCount = Math.min(questions.size(), applicationAnswers.size());
        return IntStream.range(0, pairCount)
                .mapToObj(index -> new QuestionAnswerQuery(questions.get(index), applicationAnswers.get(index)))
                .toList();
    }
}
