package com.duing.domain.recruitment.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.recruitment.exception.RecruitmentException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link RecruitmentQuestion} 은 Task1 시점엔 어느 서비스에서도 호출되지 않는 스캐폴딩(다음 태스크에서
 * 선택형 질문 기능이 연결될 때 사용)이지만, 로직 자체는 이미 완성되어 있으므로 미리 단위 테스트로
 * 고정해 둔다 — 연결 시점에 로직 결함이 뒤늦게 드러나는 것을 방지한다.
 */
class RecruitmentQuestionTest {

    @Test
    @DisplayName("TEXT 질문은 답변 values 의 첫 번째 값을 그대로 표시 문자열로 반환한다")
    void formatAnswerValuesReturnsFirstValueForTextQuestion() {
        RecruitmentQuestion textQuestion = RecruitmentQuestion.createText("자기소개를 해주세요");

        assertThat(textQuestion.formatAnswerValues(List.of("안녕하세요"))).isEqualTo("안녕하세요");
    }

    @Test
    @DisplayName("TEXT 질문에 values 가 없거나 null 이면 빈 문자열을 반환한다")
    void formatAnswerValuesReturnsBlankWhenNoValuesForTextQuestion() {
        RecruitmentQuestion textQuestion = RecruitmentQuestion.createText("자기소개를 해주세요");

        assertThat(textQuestion.formatAnswerValues(List.of())).isEmpty();
        assertThat(textQuestion.formatAnswerValues(null)).isEmpty();
    }

    @Test
    @DisplayName("선택형 질문은 choiceId 를 라벨로 해석해 콤마로 조인한 문자열을 반환한다")
    void formatAnswerValuesJoinsResolvedLabelsForChoiceQuestion() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion choiceQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.MULTIPLE_CHOICE, true, List.of(backend, frontend));

        String formatted = choiceQuestion.formatAnswerValues(List.of(backend.id(), frontend.id()));

        assertThat(formatted).isEqualTo("백엔드, 프론트엔드");
    }

    @Test
    @DisplayName("선택형 질문에서 어떤 선택지로도 해석되지 않는 choiceId 는 표시 문자열에서 무시된다")
    void formatAnswerValuesIgnoresUnresolvedChoiceId() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        RecruitmentQuestion choiceQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, QuestionChoice.create("프론트엔드")));

        String formatted = choiceQuestion.formatAnswerValues(List.of(backend.id(), "존재하지-않는-choice-id"));

        assertThat(formatted).isEqualTo("백엔드");
    }

    @Test
    @DisplayName("정상적인 질문 정의 목록은 예외 없이 검증을 통과한다")
    void validateDefinitionsAcceptsValidQuestions() {
        RecruitmentQuestion textQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion choiceQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("백엔드"), QuestionChoice.create("프론트엔드")));

        assertThatCode(() -> RecruitmentQuestion.validateDefinitions(List.of(textQuestion, choiceQuestion)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("질문 id 가 중복되면 InvalidQuestionDefinitionException 이 발생한다")
    void validateDefinitionsRejectsDuplicateQuestionId() {
        RecruitmentQuestion first = RecruitmentQuestion.createText("질문1");
        RecruitmentQuestion duplicateId = new RecruitmentQuestion(
                first.id(), "질문2", QuestionType.TEXT, true, List.of());

        assertThatThrownBy(() -> RecruitmentQuestion.validateDefinitions(List.of(first, duplicateId)))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class);
    }

    @Test
    @DisplayName("주관식(TEXT) 질문에 선택지가 있으면 InvalidQuestionDefinitionException 이 발생한다")
    void validateDefinitionsRejectsTextQuestionWithChoices() {
        RecruitmentQuestion invalidTextQuestion = new RecruitmentQuestion(
                "id-1", "질문", QuestionType.TEXT, true, List.of(QuestionChoice.create("선택지")));

        assertThatThrownBy(() -> RecruitmentQuestion.validateDefinitions(List.of(invalidTextQuestion)))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class);
    }

    @Test
    @DisplayName("선택형 질문의 선택지가 2개 미만이면 InvalidQuestionDefinitionException 이 발생한다")
    void validateDefinitionsRejectsChoiceQuestionWithFewerThanTwoChoices() {
        RecruitmentQuestion singleChoiceOnly = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(QuestionChoice.create("백엔드")));

        assertThatThrownBy(() -> RecruitmentQuestion.validateDefinitions(List.of(singleChoiceOnly)))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class);
    }

    @Test
    @DisplayName("선택지 id 가 같은 질문 안에서 중복되면 InvalidQuestionDefinitionException 이 발생한다")
    void validateDefinitionsRejectsDuplicateChoiceId() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice duplicateChoiceId = new QuestionChoice(backend.id(), "프론트엔드");
        RecruitmentQuestion choiceQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.MULTIPLE_CHOICE, true, List.of(backend, duplicateChoiceId));

        assertThatThrownBy(() -> RecruitmentQuestion.validateDefinitions(List.of(choiceQuestion)))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class);
    }

    @Test
    @DisplayName("선택지 라벨이 같은 질문 안에서 중복되면(공백 무시) InvalidQuestionDefinitionException 이 발생한다")
    void validateDefinitionsRejectsDuplicateChoiceLabel() {
        RecruitmentQuestion choiceQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("백엔드"), QuestionChoice.create(" 백엔드 ")));

        assertThatThrownBy(() -> RecruitmentQuestion.validateDefinitions(List.of(choiceQuestion)))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class);
    }
}
