package com.duing.domain.joincode.service;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.command.BulkApproveJoinRequestsCommand;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import com.duing.domain.joincode.service.dto.query.BulkApproveJoinRequestsResult;
import com.duing.domain.joincode.service.dto.query.JoinCodeCheckQuery;
import com.duing.domain.joincode.service.dto.query.JoinRequestDecisionResult;
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

    /**
     * 단건 승인/거절. 승인 요청이라도 이미 활성 회원이면 자동 거절 결과가 돌아온다(예외 아님).
     * 일괄 승인이 건별 트랜잭션을 얻기 위해 self-proxy 로 호출하므로 인터페이스에 노출한다.
     */
    JoinRequestDecisionResult decide(DecideJoinRequestCommand decideCommand);

    /** 일괄 승인 — 건별 독립 트랜잭션. 실패는 사유와 함께 반환한다. */
    BulkApproveJoinRequestsResult bulkApprove(BulkApproveJoinRequestsCommand bulkCommand);

    /** 계정 탈퇴 시 본인의 대기 요청 전부를 자동 거절하고 확보했던 자리를 환급한다(#1142). 호출자가 users 행을 잠근 뒤 부른다. */
    void rejectAllPendingOnWithdrawal(Long userId);
}
