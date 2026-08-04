package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public record MyApplicationDetailQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        /**
         * 모집 마감 여부 — 지원 상태와 직교한 축이다. 마감 후에는 면접 안내·철회처럼
         * 더 이상 성립하지 않는 UI 를 지원자 화면이 스스로 접을 수 있어야 한다.
         */
        RecruitmentStatus recruitmentStatus,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        AssignedInterviewQuery interview,
        LocalDateTime submittedAt,
        int interviewAvailabilityCount,
        LocalDateTime availabilityDeadline,
        boolean useInterview
) {
    /**
     * 면접 진행 필드(가능시간 제출 수 / 배정 면접 / 마감 시각)를 기본값으로 채워 반환한다.
     * 호출자가 신규 필드를 알 필요 없는 경우(단위 테스트 / 면접 미사용 경로)에 사용한다.
     */
    public static MyApplicationDetailQuery from(Application application) {
        return fromAll(application, 0, null, null);
    }

    /**
     * 전체 필드를 포함하는 최종 팩토리 메서드.
     * {@code interview} 는 ASSIGNED 상태 schedule 이 있을 때만 채워지고, 그 외에는 {@code null} 로 전달한다.
     */
    public static MyApplicationDetailQuery fromAll(
            Application application,
            int interviewAvailabilityCount,
            AssignedInterviewQuery interview,
            LocalDateTime availabilityDeadline
    ) {
        var recruitment = application.getRecruitment();
        var club = recruitment.getClub();
        RecruitmentForm form = recruitment.getForm();
        List<RecruitmentQuestion> formQuestions = form == null ? List.of() : form.getQuestions();

        // 위치가 아닌 questionId 로 답변을 페어링한다 (스펙 §2.4). 동일 questionId 가 중복되면 첫 번째만
        // 채택 — 정상 제출은 항상 1:1 이며, 중복은 방어적 처리일 뿐이다.
        Map<String, ApplicationAnswer> answerByQuestionId = application.getAnswers().stream()
                .filter(answer -> answer.questionId() != null)
                .collect(Collectors.toMap(ApplicationAnswer::questionId, Function.identity(),
                        (first, duplicate) -> first));
        List<String> questions = formQuestions.stream().map(RecruitmentQuestion::text).toList();
        List<String> answers = formQuestions.stream()
                .map(question -> {
                    ApplicationAnswer answer = answerByQuestionId.get(question.id());
                    return question.formatAnswerValues(answer == null ? List.of() : answer.values());
                })
                .toList();

        return new MyApplicationDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                recruitment.getStatus(),
                club.getId(),
                club.getName(),
                questions,
                answers,
                application.getStatus(),
                interview,
                application.getCreatedAt(),
                interviewAvailabilityCount,
                availabilityDeadline,
                // 지원자 stepper 가 면접 단계를 그릴지 판단하는 유일한 근거 — 모집 설정에서 그대로 전달한다.
                recruitment.isUseInterview()
        );
    }
}
