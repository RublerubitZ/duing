package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.controller.dto.request.SubmitApplicationRequest.AnswerItemPayload;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestTest {

    @Test
    @DisplayName("지원 제출 요청은 답변과 경로 파라미터만으로 command 로 변환된다")
    void toCommandMapsAnswersAndPathParams() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("답변"), null);

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.answers()).containsExactly("답변");
        assertThat(command.answerItems()).isNull();
        assertThat(command.recruitmentId()).isEqualTo(1L);
        assertThat(command.userId()).isEqualTo(100L);
    }

    @Test
    @DisplayName("구조화 답변 요청은 questionId 와 값 목록을 그대로 담은 command 로 변환된다")
    void toCommandMapsAnswerItems() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(null, List.of(
                new AnswerItemPayload("question-1", List.of("주관식 답변")),
                new AnswerItemPayload("question-2", List.of("choice-a", "choice-b"))));

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.answers()).isNull();
        assertThat(command.answerItems()).containsExactly(
                new SubmitApplicationCommand.AnswerItem("question-1", List.of("주관식 답변")),
                new SubmitApplicationCommand.AnswerItem("question-2", List.of("choice-a", "choice-b")));
    }
}
