package com.duing.domain.joincode.service;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;
import com.duing.domain.joincode.service.dto.query.JoinRequestDetailQuery;
import com.duing.domain.joincode.service.dto.query.JoinRequestSummaryQuery;
import java.util.List;

public interface JoinRequestService {

    /** 코드 확인. {@code currentUserId} 가 null 이면 비로그인 확인이다. */
    JoinCodeCheckQuery check(String rawCode, Long currentUserId, String clientIp);

    void createRequest(CreateJoinRequestCommand createCommand);

    /** 운영진 목록 조회(상태별). 전화번호는 담지 않는다. */
    List<JoinRequestSummaryQuery> getRequests(Long clubId, Long requesterId, JoinRequestStatus status);

    /** 운영진 상세 조회 — 전화번호 포함. 타 동아리 요청은 404. */
    JoinRequestDetailQuery getRequest(Long clubId, Long joinRequestId, Long requesterId);
}
