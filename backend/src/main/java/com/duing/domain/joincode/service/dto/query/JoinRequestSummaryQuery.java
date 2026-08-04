package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import java.time.LocalDateTime;

/**
 * 운영진 가입 요청 목록 항목 — 외부 폼 합격자 명단과 대조하는 데 필요한 최소 정보만 담는다.
 *
 * <p>전화번호는 목록에 절대 싣지 않는다(상세 전용 — 지원자 목록/상세 전례).
 */
public record JoinRequestSummaryQuery(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String code,
        Integer generation,
        JoinRequestStatus status,
        LocalDateTime requestedAt
) {
    /** user·joinCode 가 LAZY 이므로 트랜잭션 안(또는 fetch join 결과)에서 호출한다. */
    public static JoinRequestSummaryQuery from(ClubJoinRequest joinRequest) {
        return new JoinRequestSummaryQuery(
                joinRequest.getId(),
                joinRequest.getUser().getName(),
                joinRequest.getUser().getStudentId(),
                joinRequest.getUser().getMajor(),
                joinRequest.getJoinCode().getCode(),
                joinRequest.getGeneration(),
                joinRequest.getStatus(),
                joinRequest.getCreatedAt()
        );
    }
}
