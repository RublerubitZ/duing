package com.duing.domain.interview.controller.dto.response;

public record CreateInterviewRoundResponse(Long roundId) {
    public static CreateInterviewRoundResponse from(Long roundId) {
        return new CreateInterviewRoundResponse(roundId);
    }
}
