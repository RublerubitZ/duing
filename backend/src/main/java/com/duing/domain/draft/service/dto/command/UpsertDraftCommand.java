package com.duing.domain.draft.service.dto.command;

import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import java.util.List;

public record UpsertDraftCommand(
        Long userId,
        Long recruitmentId,
        List<DraftAnswer> answers
) {}