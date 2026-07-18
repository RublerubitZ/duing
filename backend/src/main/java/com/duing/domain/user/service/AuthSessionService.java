package com.duing.domain.user.service;

import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.domain.user.service.dto.query.RotationResult;

public interface AuthSessionService {

    /**
     * 로그인 세션 + ACTIVE 리프레시 토큰을 발급한다. 상한(5) 초과분은 LRU 폐기.
     * 반드시 로그인 트랜잭션(user 행잠금 보유) 안에서 호출한다 — LRU 동시성 보호 전제 (spec §13).
     */
    IssuedSession issue(IssueSessionCommand issueSessionCommand);

    /**
     * Refresh Rotation (spec §11) — 검증→구토큰 폐기→새 쌍 발급→sliding 을 세션 행잠금 안에서
     * 원자 처리한다. 실패는 사유 불문 SessionExpiredException(401).
     */
    RotationResult rotate(String rawRefreshToken);

    /**
     * 현재 기기 로그아웃 — refresh 토큰(우선) 또는 access 의 sid 로 세션을 특정해 폐기한다.
     * 세션을 식별하지 못하면 false (호출 측이 전환기 폴백을 결정). 이미 폐기된 세션은 멱등 true.
     */
    boolean revokeCurrent(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull);

    /** 전 세션 폐기 — 전체 로그아웃·자격 변경·관리자 강제. 감사 이벤트를 사유별로 남긴다. */
    void revokeAll(Long userId, SessionRevokeReason reason);
}
