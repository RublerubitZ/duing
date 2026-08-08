package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.query.JoinRequestDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 운영 콘솔의 가입 요청 상세 — 전화번호는 이 응답에서만 내려간다.
 *
 * <p>시각 두 개는 writer 가 달라 변환도 다르다(TIMEZONE.md):
 * {@code requestedAt} 은 BaseEntity 감사 필드(JVM 존 벽시계) → system,
 * {@code reviewedAt} 은 seoulClock 으로 기록한 도메인 필드 → seoul.
 *
 * <p>{@code autoApproved} 가 true 면 처리자는 운영진이 아니라 신청자 본인이다 — 자동 승인 부원 초대
 * 링크(V107)로 접수돼 같은 트랜잭션에서 승인까지 끝난 요청이다.
 */
public record JoinRequestDetailResponse(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String phone,
        String code,
        Integer generation,
        JoinRequestStatus status,
        String rejectReason,
        Instant requestedAt,
        Instant reviewedAt,
        boolean autoApproved
) {
    public static JoinRequestDetailResponse from(JoinRequestDetailQuery joinRequestDetailQuery) {
        return new JoinRequestDetailResponse(
                joinRequestDetailQuery.joinRequestId(),
                joinRequestDetailQuery.userName(),
                joinRequestDetailQuery.studentId(),
                joinRequestDetailQuery.major(),
                joinRequestDetailQuery.phone(),
                joinRequestDetailQuery.code(),
                joinRequestDetailQuery.generation(),
                joinRequestDetailQuery.status(),
                joinRequestDetailQuery.rejectReason(),
                TimeMapper.systemWallClockToInstant(joinRequestDetailQuery.requestedAt()),
                TimeMapper.seoulWallClockToInstant(joinRequestDetailQuery.reviewedAt()),
                joinRequestDetailQuery.autoApproved()
        );
    }
}
