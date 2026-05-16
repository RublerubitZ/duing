package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.List;

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
        LocalDateTime submittedAt
) {

    public record ApplicantInfoQuery(Long userId, String name, String studentId, String email) {}

    public record QuestionAnswerQuery(String question, String answer) {}

    public static ApplicantDetailQuery from(Application application) {
        Recruitment recruitment = application.getRecruitment();
        User user = application.getUser();

        ApplicantInfoQuery applicantInfo = new ApplicantInfoQuery(
                user.getId(),
                user.getName(),
                user.getStudentId(),
                user.getEmail()
        );

        List<QuestionAnswerQuery> pairedAnswers = buildPairedAnswers(recruitment, application);

        return new ApplicantDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                recruitment.getClub().getId(),
                recruitment.getClub().getName(),
                applicantInfo,
                pairedAnswers,
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt()
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
        return java.util.stream.IntStream.range(0, pairCount)
                .mapToObj(index -> new QuestionAnswerQuery(questions.get(index), applicationAnswers.get(index)))
                .toList();
    }
}
