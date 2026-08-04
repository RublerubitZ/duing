package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import java.time.LocalDateTime;

/**
 * 운영진 가입 요청 상세 — 목록 필드에 전화번호와 처리 이력(사유·처리 시각)을 더한다.
 *
 * <p>{@code requestedAt} 은 BaseEntity 감사 필드(JVM 존 벽시계), {@code reviewedAt} 은 seoulClock 으로
 * 기록되므로 응답 경계에서 서로 다른 변환을 태운다(TIMEZONE.md).
 */
public record JoinRequestDetailQuery(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String phone,
        String code,
        Integer generation,
        JoinRequestStatus status,
        String rejectReason,
        LocalDateTime requestedAt,
        LocalDateTime reviewedAt
) {
    /** user·joinCode 가 LAZY 이므로 트랜잭션 안에서 호출한다. */
    public static JoinRequestDetailQuery from(ClubJoinRequest joinRequest) {
        return new JoinRequestDetailQuery(
                joinRequest.getId(),
                joinRequest.getUser().getName(),
                joinRequest.getUser().getStudentId(),
                joinRequest.getUser().getMajor(),
                joinRequest.getUser().getPhone(),
                joinRequest.getJoinCode().getCode(),
                joinRequest.getGeneration(),
                joinRequest.getStatus(),
                joinRequest.getRejectReason(),
                joinRequest.getCreatedAt(),
                joinRequest.getReviewedAt()
        );
    }
}
