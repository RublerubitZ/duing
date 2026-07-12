package com.duing.domain.draft.service.dto.command;

import java.util.List;

public record UpsertDraftCommand(
        Long userId,
        Long recruitmentId,
        List<DraftAnswerEntry> answers
) {
    /**
     * value(legacy 단일 문자열) 또는 values(신형) 중 하나가 채워진다.
     * TODO(legacy-questions-v1): 신 FE 전환 후 value 제거.
     */
    public record DraftAnswerEntry(String questionId, String value, List<String> values) {}
}
