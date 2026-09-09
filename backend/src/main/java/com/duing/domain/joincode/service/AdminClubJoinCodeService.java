package com.duing.domain.joincode.service;

import com.duing.domain.joincode.service.dto.query.AdminClubJoinCodeRow;
import java.util.List;

public interface AdminClubJoinCodeService {

    /**
     * 총동연 가입 링크 목록 — 동아리가 만든 링크 2종(모집 링크·부원 초대)을 폐기·만료·소진까지 전부
     * 최신순으로 돌려준다. 없거나 폐쇄(soft-delete)된 동아리는 404 다.
     */
    List<AdminClubJoinCodeRow> getJoinCodes(Long clubId);

    /**
     * 총동연 강제 폐기 — 운영진 수동 폐기와 같은 도메인 전이({@code ClubJoinCode#revoke})를 타므로
     * 이미 폐기된 링크는 최초 폐기 시각을 덮어쓰지 않고 아무 일도 하지 않는다(멱등).
     * 접수돼 있는 가입 요청은 건드리지 않는다 — 링크를 끊는 것과 이미 들어온 요청의 처리는 별개다.
     */
    void forceRevoke(Long clubId, Long joinCodeId, Long adminUserId, String reason);
}
