package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSubmitAnswersTest {

    @Test
    @DisplayName("답변 values 목록의 null 원소는 빈 문자열로 정규화되어 저장된다 — jsonb 에 null 이 새지 않는다 (#604)")
    void nullValueElementsAreNormalizedToBlank() {
        ApplicationAnswer answer = new ApplicationAnswer("q1", Arrays.asList("첫 답변", null, "셋째 답변"));

        assertThat(answer.values()).containsExactly("첫 답변", "", "셋째 답변");
    }

    @Test
    @DisplayName("null values 목록 자체는 빈 목록으로 저장된다")
    void nullValuesListBecomesEmptyList() {
        ApplicationAnswer answer = new ApplicationAnswer("q1", null);

        assertThat(answer.values()).isEmpty();
    }

    @Test
    @DisplayName("답변 목록 자체의 null 원소는 제거되어 저장된다")
    void nullAnswerElementsAreFilteredOut() {
        Application application = Application.submit(null, null,
                Arrays.asList(new ApplicationAnswer("q1", List.of("답변")), null));

        assertThat(application.getAnswers()).hasSize(1);
        assertThat(application.getAnswers().get(0).questionId()).isEqualTo("q1");
    }

    @Test
    @DisplayName("null 답변 목록 자체는 빈 목록으로 저장된다")
    void nullAnswersListBecomesEmptyList() {
        Application application = Application.submit(null, null, null);

        assertThat(application.getAnswers()).isEmpty();
    }
}
