package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.club.entity.Club;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public record ApplicantDetailQuery(
        Long applicationId,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicantInfoQuery applicant,
        List<QuestionAnswerQuery> answers,
        ApplicationStatus status,
        AssignedInterviewQuery interview,
        LocalDateTime submittedAt,
        List<StatusHistoryItemQuery> statusHistory,
        EvaluationItemQuery myEvaluation,
        List<EvaluationItemQuery> otherEvaluations,
        List<AvailabilityItem> interviewAvailabilities,
        AvailabilityItem assignedSlot,
        InterviewRoundBriefQuery interviewRound
) {

    public record ApplicantInfoQuery(Long userId, String name, String studentId, String email,
                                     College college, String major, Grade grade, String phone) {}

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
     * 운영진 시점 카드/모달에서 사용하는 경량 슬롯 표현.
     * 정원/배정수는 의도적으로 포함하지 않는다. (P0-2 spec — 정보 밀도 낮춤)
     */
    public record AvailabilityItem(
            Long slotId,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {}

    /**
     * 운영진 상세 카드에 노출하는 면접 라운드 요약.
     * placement-active 멤버십(§5.4 — DRAFT 포함, EXCLUDED·CANCELLED 제외)이 있을 때만 채워진다.
     * <p>
     * {@code unresponded} 는 저장 필드가 아니라 파생값이다 — INVITED && now > availabilityDeadline.
     * {@code alternativeAvailabilityText} 는 NO_AVAILABLE_SLOT 상태일 때만 의미를 가지며 그 외엔 null.
     */
    public record InterviewRoundBriefQuery(
            Long roundId,
            String title,
            RoundStatus roundStatus,
            RoundMemberStatus memberStatus,
            boolean unresponded,
            String alternativeAvailabilityText
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
     * 면접 가능시간/배정 슬롯/배정 면접 정보 없이 위임한다.
     * 기존 호출자(서비스 단위 테스트 등)의 backward-compatibility 를 위해 유지한다.
     */
    public static ApplicantDetailQuery fromAll(Application application,
                                               List<ApplicationStatusHistory> historyRows,
                                               List<ApplicationEvaluation> allEvaluations,
                                               Long currentUserId) {
        return fromAll(application, historyRows, allEvaluations, currentUserId, List.of(), null, null, null);
    }

    /**
     * 전체 필드를 포함하는 최종 팩토리 메서드 (면접 라운드 요약 포함).
     * currentUserId 기준으로 myEvaluation / otherEvaluations 를 분리한다.
     * currentUserId 가 null 이면 모든 평가를 otherEvaluations 에 배치한다.
     * interviewAvailabilities / assignedSlot 은 면접 미사용 모집에선 빈 리스트 / null 로 전달한다.
     * {@code interview} 는 ASSIGNED schedule + InterviewRound.location 이 모두 존재할 때만 전달, 그 외엔 {@code null}.
     * {@code interviewRound} 는 placement-active 멤버십이 없으면 null (= 대기열/선정 전).
     */
    public static ApplicantDetailQuery fromAll(Application application,
                                               List<ApplicationStatusHistory> historyRows,
                                               List<ApplicationEvaluation> allEvaluations,
                                               Long currentUserId,
                                               List<AvailabilityItem> interviewAvailabilities,
                                               AvailabilityItem assignedSlot,
                                               AssignedInterviewQuery interview,
                                               InterviewRoundBriefQuery interviewRound) {
        Recruitment recruitment = application.getRecruitment();
        User applicationUser = application.getUser();

        ApplicantInfoQuery applicantInfo = new ApplicantInfoQuery(
                applicationUser.getId(),
                applicationUser.getName(),
                applicationUser.getStudentId(),
                applicationUser.getEmail(),
                applicationUser.getCollege(),
                applicationUser.getMajor(),
                applicationUser.getGrade(),
                applicationUser.getPhone()
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
                interview,
                application.getCreatedAt(),
                statusHistory,
                myEvaluation,
                otherEvaluations,
                interviewAvailabilities == null ? List.of() : interviewAvailabilities,
                assignedSlot,
                interviewRound
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
        List<RecruitmentQuestion> questions = form == null ? List.of() : form.getQuestions();

        // 위치가 아닌 questionId 로 답변을 페어링한다 (스펙 §2.4). 질문 순서대로 전 질문을 노출하며
        // 답변이 없는 질문(폼 편집 이후 남은 기존 지원서 등)은 빈 문자열로 채운다.
        Map<String, ApplicationAnswer> answerByQuestionId = application.getAnswers().stream()
                .filter(answer -> answer.questionId() != null)
                .collect(Collectors.toMap(ApplicationAnswer::questionId, Function.identity(),
                        (first, duplicate) -> first));
        return questions.stream()
                .map(question -> {
                    ApplicationAnswer answer = answerByQuestionId.get(question.id());
                    return new QuestionAnswerQuery(question.text(),
                            question.formatAnswerValues(answer == null ? List.of() : answer.values()));
                })
                .toList();
    }
}
