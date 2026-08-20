package com.duing.domain.application.service;

import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 제출된 답변이 모집 폼을 만족하는지 판정하는 단일 지점 (스펙 §2.6).
 *
 * <p>질문 목록과 답변 목록만 보면 끝나는 순수 판정이라 리포지토리·시계·트랜잭션이 필요 없다.
 * 그래서 빈으로 만들지 않고 static 으로 둔다({@link com.duing.domain.recruitment.service.ClosedRecruitmentPolicy}
 * 와 같은 결) — 검증 규칙을 읽으려고 긴 지원 서비스를 뒤질 필요가 없어지고,
 * 지원 서비스의 생성자 의존도 늘지 않는다.
 *
 * <p>질문 목록을 넘겨받는 이유는 폼이 없는 모집의 빈 목록 처리를 호출자 쪽 단일 소스에 맡기기 위해서다.
 */
public final class ApplicationAnswerValidator {

    private ApplicationAnswerValidator() {
    }

    /**
     * 질문 하나당 답변 하나가 정확히 대응하는지 확인한 뒤 유형별 규칙을 건다.
     * 개수 불일치·질문 id 누락·중복 답변·미응답 질문은 모두 답변 형식 오류로 거부한다.
     */
    public static void validateAnswersAgainstForm(
            List<RecruitmentQuestion> questions, List<ApplicationAnswer> answers) {
        if (questions.size() != answers.size()) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
        Map<String, ApplicationAnswer> answerByQuestionId = new HashMap<>();
        for (ApplicationAnswer answer : answers) {
            if (answer.questionId() == null
                    || answerByQuestionId.put(answer.questionId(), answer) != null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
        }
        for (RecruitmentQuestion question : questions) {
            ApplicationAnswer answer = answerByQuestionId.get(question.id());
            if (answer == null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
            validateAnswerForQuestion(question, answer);
        }
    }

    /**
     * 스펙 §2.6 유형별 규칙 — 필수/선택 × TEXT/SINGLE_CHOICE/MULTIPLE_CHOICE.
     * values 원소의 null 정규화(→ 빈 문자열)와 values 자체의 null 정규화(→ 빈 목록)는
     * {@link ApplicationAnswer} 컴팩트 생성자가 이미 끝낸 상태로 들어온다.
     */
    private static void validateAnswerForQuestion(RecruitmentQuestion question, ApplicationAnswer answer) {
        List<String> values = answer.values();
        switch (question.type()) {
            case TEXT -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidAnswersException();
                }
                String content = values.isEmpty() ? "" : values.get(0);
                if (question.required() && content.isBlank()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
            }
            case SINGLE_CHOICE -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
            case MULTIPLE_CHOICE -> {
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                if (values.size() != Set.copyOf(values).size()) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
            // enum 3 값을 모두 다루지만, 새 유형이 추가될 때 검증 없이 조용히 통과하지 않도록 명시적으로 막는다
            // (validateClubMembershipPolicy 와 동일한 방어).
            default -> throw new IllegalStateException(
                    "답변 검증 규칙이 정의되지 않은 질문 유형입니다: " + question.type());
        }
    }

    /** "바로 그 질문의" 선택지인지 검증 — 타 질문의 choiceId·미지 choiceId 를 모두 거부한다 (스펙 §2.6). */
    private static void requireChoiceIdsBelongToQuestion(
            RecruitmentQuestion question, List<String> selectedChoiceIds) {
        Set<String> allowedChoiceIds = question.choices().stream()
                .map(QuestionChoice::id)
                .collect(Collectors.toSet());
        if (!allowedChoiceIds.containsAll(selectedChoiceIds)) {
            throw new ApplicationDomainException.InvalidChoiceSelectionException();
        }
    }
}
