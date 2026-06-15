package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestTest {

    @Test
    @DisplayName("지원 제출 요청은 답변과 경로 파라미터만으로 command 로 변환된다")
    void toCommandMapsAnswersAndPathParams() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("답변"));

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.answers()).containsExactly("답변");
        assertThat(command.recruitmentId()).isEqualTo(1L);
        assertThat(command.userId()).isEqualTo(100L);
    }
}
