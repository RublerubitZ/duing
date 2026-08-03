package com.duing.domain.joincode.service;

import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;

public interface JoinRequestService {

    /** 코드 확인. {@code currentUserId} 가 null 이면 비로그인 확인이다. */
    JoinCodeCheckQuery check(String rawCode, Long currentUserId, String clientIp);

    void createRequest(CreateJoinRequestCommand createCommand);
}
