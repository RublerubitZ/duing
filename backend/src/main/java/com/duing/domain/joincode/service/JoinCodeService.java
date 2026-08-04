package com.duing.domain.joincode.service;

import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import java.util.Optional;

public interface JoinCodeService {

    JoinCodeQuery create(CreateJoinCodeCommand createCommand);

    Optional<JoinCodeQuery> findActive(Long clubId, Long requesterId);

    void revoke(Long clubId, Long joinCodeId, Long requesterId);
}
