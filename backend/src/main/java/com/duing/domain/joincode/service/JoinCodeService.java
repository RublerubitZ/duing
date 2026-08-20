package com.duing.domain.joincode.service;

import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import java.util.List;
import java.util.Optional;

public interface JoinCodeService {

    JoinCodeQuery create(CreateJoinCodeCommand createCommand);

    Optional<JoinCodeQuery> findActive(Long clubId, Long recruitmentId, Long requesterId);

    void revoke(Long clubId, Long recruitmentId, Long joinCodeId, Long requesterId);

    /**
     * 동아리 단위 부원 초대 링크 발급 (V107). 모집을 전혀 보지 않으며 동아리당 활성 1개라,
     * 이미 활성 링크가 있으면 폐기 후 재발급하는 재생성이다.
     */
    JoinCodeQuery createClubInvite(CreateClubInviteCodeCommand createCommand);

    Optional<JoinCodeQuery> findActiveClubInvite(Long clubId, Long requesterId);

    void revokeClubInvite(Long clubId, Long joinCodeId, Long requesterId);

    /**
     * 모집 1건의 활성 가입 코드만 폐기한다 — 동아리 초대 링크는 건드리지 않는다.
     * 폐기 UPDATE 의 행 잠금이 동시 가입 신청을 직렬화하므로, 모집 삭제 경로는 대기 요청 검사보다
     * 먼저 이 메서드를 호출해야 한다.
     *
     * <p>호출자가 이미 권한을 확인한 내부 경로 전용이다(모집 삭제=운영진 가드, 동아리 폐쇄=총동연).
     */
    void revokeActiveByRecruitment(Long clubId, Long recruitmentId, Long actorUserId);

    /**
     * 동아리 폐쇄로 딸린 모집이 모두 사라질 때 활성 가입 링크를 함께 폐기한다 (#869).
     * 마감된 모집의 링크도 가입 가능 기간 안에는 살아 있으므로 모집 상태를 가리지 않고 전부 폐기한다.
     */
    void revokeActiveOnClubClosure(Long clubId, List<Long> recruitmentIds, Long actorAdminUserId);
}
