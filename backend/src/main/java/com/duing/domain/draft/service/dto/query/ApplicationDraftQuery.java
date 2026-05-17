package com.duing.domain.draft.service.dto.query;

import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicationDraftQuery(
        Long userId,
        Long recruitmentId,
        List<DraftAnswer> answers,
        LocalDateTime updatedAt
) {

    public static ApplicationDraftQuery from(ApplicationDraft draft) {
        return new ApplicationDraftQuery(
                draft.getUserId(),
                draft.getRecruitmentId(),
                draft.getAnswers(),
                draft.getUpdatedAt()
        );
    }
}