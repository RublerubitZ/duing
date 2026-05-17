package com.duing.domain.draft.controller.dto.response;

import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import com.duing.domain.draft.service.dto.query.ApplicationDraftQuery;
import java.time.LocalDateTime;
import java.util.List;

public record DraftResponse(
        boolean exists,
        List<DraftAnswer> answers,
        LocalDateTime updatedAt
) {

    public static DraftResponse empty() {
        return new DraftResponse(false, List.of(), null);
    }

    public static DraftResponse existing(ApplicationDraftQuery query) {
        return new DraftResponse(true, query.answers(), query.updatedAt());
    }
}