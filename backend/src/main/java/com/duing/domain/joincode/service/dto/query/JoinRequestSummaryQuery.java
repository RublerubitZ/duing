package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import java.time.LocalDateTime;

/**
 * 운영진 가입 요청 목록 항목 — 외부 폼 합격자 명단과 대조하는 데 필요한 최소 정보만 담는다.
 *
 * <p>전화번호는 목록에 절대 싣지 않는다(상세 전용 — 지원자 목록/상세 전례).
 *
 * <p>{@code autoApproved} 는 컬럼이 아니라 소속 코드의 {@code autoApprove} 에서 파생한다(V107, 스펙 §4)
 * — 자동 승인 링크의 요청은 전부 자동 승인 경로를 타므로 파생이 정확하다. 코드 프록시는 바로 위
 * {@code getCode()} 가 이미 초기화하므로 추가 쿼리는 없다.
 */
public record JoinRequestSummaryQuery(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String code,
        Integer generation,
        JoinRequestStatus status,
        LocalDateTime requestedAt,
        boolean autoApproved
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
                joinRequest.getCreatedAt(),
                joinRequest.getJoinCode().isAutoApprove()
        );
    }
}
