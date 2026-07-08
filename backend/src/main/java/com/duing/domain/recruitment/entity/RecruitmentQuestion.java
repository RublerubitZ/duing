package com.duing.domain.recruitment.entity;

import com.duing.domain.recruitment.exception.RecruitmentException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 지원서 질문(jsonb 원소). id 는 서버가 생성 시 1회 발급하고 수정 시 절대 재생성하지 않는다 —
 * 답변(ApplicationAnswer.questionId)·임시저장이 위치가 아닌 id 로 질문을 참조한다 (스펙 §2.1·§2.2).
 */
public record RecruitmentQuestion(
        String id, String text, QuestionType type, boolean required, List<QuestionChoice> choices) {

    public RecruitmentQuestion {
        choices = choices == null ? List.of() : List.copyOf(choices);
    }

    /** legacy string 질문 매핑 — 기존과 동일하게 주관식·필수로 승격한다 (스펙 §2.5). */
    public static RecruitmentQuestion createText(String text) {
        return new RecruitmentQuestion(UUID.randomUUID().toString(), text, QuestionType.TEXT, true, List.of());
    }

    public static RecruitmentQuestion create(String text, QuestionType type, boolean required,
                                             List<QuestionChoice> choices) {
        return new RecruitmentQuestion(UUID.randomUUID().toString(), text, type, required, choices);
    }

    /**
     * 조회 응답의 표시 문자열 — TEXT 는 본문, 선택형은 choiceId 를 라벨로 해석해 ", " 조인.
     * 미해석 choiceId 는 무시한다 (스펙 §2.7).
     */
    public String formatAnswerValues(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        if (type == QuestionType.TEXT) {
            return values.get(0);
        }
        // 선택지 id 중복은 validateDefinitions 가 등록 시점에 막지만, 조회 경로가 저장 데이터를 믿고
        // 깨지지 않도록 merge function 으로 방어한다 — 중복 시 첫 선택지 라벨을 채택
        // (MyApplicationDetailQuery 의 questionId 중복 방어와 동일 원칙). 없으면 IllegalStateException 으로 조회가 죽는다.
        Map<String, String> labelByChoiceId = choices.stream()
                .collect(Collectors.toMap(QuestionChoice::id, QuestionChoice::label,
                        (first, duplicate) -> first));
        return values.stream()
                .map(labelByChoiceId::get)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(", "));
    }

    /** 질문 정의의 유형별 의미 검증 (스펙 §2.6). 필드 형식(길이·개수)은 요청 DTO Bean Validation 담당. */
    public static void validateDefinitions(List<RecruitmentQuestion> questions) {
        Set<String> questionIds = new HashSet<>();
        for (RecruitmentQuestion question : questions) {
            if (!questionIds.add(question.id())) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("질문 id 가 중복되었습니다.");
            }
            if (question.type() == QuestionType.TEXT) {
                if (!question.choices().isEmpty()) {
                    throw new RecruitmentException.InvalidQuestionDefinitionException(
                            "주관식 질문에는 선택지를 둘 수 없습니다.");
                }
                continue;
            }
            if (question.choices().size() < 2) {
                throw new RecruitmentException.InvalidQuestionDefinitionException(
                        "선택형 질문은 선택지를 2개 이상 등록해야 합니다.");
            }
            Set<String> choiceIds = question.choices().stream().map(QuestionChoice::id)
                    .collect(Collectors.toSet());
            if (choiceIds.size() != question.choices().size()) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("선택지 id 가 중복되었습니다.");
            }
            Set<String> labels = question.choices().stream().map(choice -> choice.label().strip())
                    .collect(Collectors.toSet());
            if (labels.size() != question.choices().size()) {
                throw new RecruitmentException.InvalidQuestionDefinitionException(
                        "같은 질문 안에서 선택지 내용이 중복될 수 없습니다.");
            }
        }
    }
}
