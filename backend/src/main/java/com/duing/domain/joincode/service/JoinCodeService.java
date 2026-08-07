package com.duing.domain.joincode.service;

import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import java.util.List;
import java.util.Optional;

public interface JoinCodeService {

    JoinCodeQuery create(CreateJoinCodeCommand createCommand);

    Optional<JoinCodeQuery> findActive(Long clubId, Long recruitmentId, Long requesterId);

    void revoke(Long clubId, Long recruitmentId, Long joinCodeId, Long requesterId);

    /**
     * 동아리 폐쇄로 딸린 모집이 모두 사라질 때 활성 가입 링크를 함께 폐기한다 (#869).
     * 마감된 모집의 링크도 가입 가능 기간 안에는 살아 있으므로 모집 상태를 가리지 않고 전부 폐기한다.
     */
    void revokeActiveOnClubClosure(Long clubId, List<Long> recruitmentIds, Long actorAdminUserId);
}
