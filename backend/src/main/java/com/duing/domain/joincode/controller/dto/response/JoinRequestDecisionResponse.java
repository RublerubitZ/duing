package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.JoinRequestDecisionResult;

/**
 * 단건 처리 결과. 승인 요청이 자동 거절(AUTO_REJECTED)로 끝날 수 있어
 * 운영 콘솔이 그 사실을 알아야 하므로 204 대신 200 + 본문으로 돌려준다.
 */
public record JoinRequestDecisionResponse(JoinRequestDecisionResult result) {

    public static JoinRequestDecisionResponse from(JoinRequestDecisionResult decisionResult) {
        return new JoinRequestDecisionResponse(decisionResult);
    }
}
