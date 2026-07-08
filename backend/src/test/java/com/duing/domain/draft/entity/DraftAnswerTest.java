package com.duing.domain.draft.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DraftAnswerTest {

    @Test
    @DisplayName("임시저장 values 의 null 원소는 빈 문자열로 정규화된다 — jsonb 에 null 이 새지 않는다 (#604)")
    void nullValueElementsAreNormalizedToBlank() {
        DraftAnswer draftAnswer = new DraftAnswer("q1", Arrays.asList("첫 값", null, "셋째 값"));

        assertThat(draftAnswer.values()).containsExactly("첫 값", "", "셋째 값");
    }

    @Test
    @DisplayName("null values 목록 자체는 빈 목록으로 정규화된다")
    void nullValuesListBecomesEmptyList() {
        DraftAnswer draftAnswer = new DraftAnswer("q1", null);

        assertThat(draftAnswer.values()).isEmpty();
    }
}
