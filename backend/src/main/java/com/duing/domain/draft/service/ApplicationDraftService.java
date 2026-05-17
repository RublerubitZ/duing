package com.duing.domain.draft.service;

import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.draft.service.dto.query.ApplicationDraftQuery;
import java.util.Optional;

public interface ApplicationDraftService {

    Optional<ApplicationDraftQuery> find(Long userId, Long recruitmentId);

    void upsert(UpsertDraftCommand command);

    void discard(Long userId, Long recruitmentId);
}