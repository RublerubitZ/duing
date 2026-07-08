package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewStartAt,
        Integer myScore
) {
    /**
     * interviewStartAt 은 ASSIGNED InterviewSchedule 이 가리키는 슬롯의 startTime 으로
     * QueryDSL repository 에서 직접 채워 넘긴다. ASSIGNED schedule 이 없으면 null.
     * 더 이상 {@code Application.getInterviewAt()} 스칼라 필드를 읽지 않는다.
     * <p>
     * {@code formQuestions} 는 이 지원서가 속한 모집의 현재 폼 질문이다. 폼이 없으면 빈 목록을 넘긴다.
     */
    public static ApplicantQuery of(Application application,
                                    List<RecruitmentQuestion> formQuestions,
                                    LocalDateTime interviewStartAt,
                                    Integer myScore) {
        // 운영진 목록의 답변 미리보기 — 위치가 아닌 questionId 로 페어링하고, 선택형은 choiceId 가 아니라
        // 선택지 라벨로 해석해 표시한다 (스펙 §2.7, MyApplicationDetailQuery 와 동일 방식).
        // 동일 questionId 가 중복되면 첫 번째만 채택 — 정상 제출은 항상 1:1 이며, 중복은 방어적 처리일 뿐이다.
        Map<String, ApplicationAnswer> answerByQuestionId = application.getAnswers().stream()
                .filter(answer -> answer.questionId() != null)
                .collect(Collectors.toMap(ApplicationAnswer::questionId, Function.identity(),
                        (first, duplicate) -> first));
        List<String> answers = formQuestions.stream()
                .map(question -> {
                    ApplicationAnswer answer = answerByQuestionId.get(question.id());
                    return question.formatAnswerValues(answer == null ? List.of() : answer.values());
                })
                .toList();
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                answers,
                application.getStatus(),
                application.getCreatedAt(),
                interviewStartAt,
                myScore
        );
    }
}
