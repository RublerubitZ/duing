package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSubmitAnswersTest {

    @Test
    @DisplayName("답변 목록의 null 원소는 빈 문자열로 정규화되어 저장된다 — jsonb 에 null 이 새지 않는다")
    void nullAnswerElementsAreNormalizedToBlank() {
        Application application = Application.submit(null, null,
                Arrays.asList("첫 답변", null, "셋째 답변"));

        assertThat(application.getAnswers()).containsExactly("첫 답변", "", "셋째 답변");
    }

    @Test
    @DisplayName("null 답변 목록 자체는 빈 목록으로 저장된다")
    void nullAnswersListBecomesEmptyList() {
        Application application = Application.submit(null, null, null);

        assertThat(application.getAnswers()).isEmpty();
    }
}
