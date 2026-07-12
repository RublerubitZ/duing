package com.duing.domain.recruitment.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CreateRecruitmentRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private CreateRecruitmentRequest requestWithQuestions(List<String> questions) {
        return new CreateRecruitmentRequest(
                "제목",
                null,
                LocalDate.now(),
                null,
                1,
                null,
                null,
                null,
                null,
                questions,
                null,
                null,
                null,
                null
        );
    }

    @Test
    @DisplayName("질문 항목이 500자를 초과하면 Bean Validation 에서 거부된다")
    void createWithTooLongQuestionIsRejected() {
        assertThat(validator.validate(requestWithQuestions(List.of("가".repeat(501)))))
                .anyMatch(violation -> violation.getMessage().contains("500자"));
    }

    @Test
    @DisplayName("질문이 50개를 초과하면 Bean Validation 에서 거부된다")
    void createWithTooManyQuestionsIsRejected() {
        List<String> questions = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> "질문" + index)
                .toList();
        assertThat(validator.validate(requestWithQuestions(questions)))
                .anyMatch(violation -> violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("질문 50개(경계값)와 500자 질문은 통과한다 — 답변 개수 상한과 일치")
    void createWithExactlyMaxQuestionsPasses() {
        List<String> questions = IntStream.rangeClosed(1, 50)
                .mapToObj(index -> "질문" + index)
                .toList();
        assertThat(validator.validate(requestWithQuestions(questions))).isEmpty();
        assertThat(validator.validate(requestWithQuestions(List.of("가".repeat(500))))).isEmpty();
    }
}
