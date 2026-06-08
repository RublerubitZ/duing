package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestTest {

    @Test
    @DisplayName("interviewSlotIds 가 누락된(legacy) 요청은 빈 리스트로 정규화되어 일반 모집 흐름을 그대로 탄다")
    void interviewSlotIdsNullIsNormalizedToEmptyList() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("답변"), null);

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.interviewSlotIds()).isNotNull().isEmpty();
        assertThat(command.answers()).containsExactly("답변");
        assertThat(command.recruitmentId()).isEqualTo(1L);
        assertThat(command.userId()).isEqualTo(100L);
    }

    @Test
    @DisplayName("interviewSlotIds 가 명시된 요청은 그 값이 그대로 command 로 전달된다")
    void interviewSlotIdsPresentIsPropagated() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("답변"), List.of(10L, 20L));

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.interviewSlotIds()).containsExactly(10L, 20L);
    }
}
