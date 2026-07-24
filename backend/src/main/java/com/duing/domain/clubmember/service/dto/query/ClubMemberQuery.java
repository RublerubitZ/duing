package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

/**
 * 서비스 내부 DTO. {@code phone} 은 원본이며, 직렬화는 항상 {@code ClubMemberResponse} 를 거쳐
 * 마스킹된 값으로만 나간다(원본 phone 은 응답에 포함되지 않음).
 * {@code generation} 은 회원 기수(미사용 시 null), {@code feeStatus} 는 최신 청구 기준 회비 상태다.
 */
public record ClubMemberQuery(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        LocalDateTime joinedAt,
        String major,
        Grade grade,
        String phone,
        Integer generation,
        MemberFeeStatus feeStatus
) {
    public static ClubMemberQuery from(ClubMember clubMember, MemberFeeStatus feeStatus) {
        return new ClubMemberQuery(
                clubMember.getId(),
                clubMember.getUser().getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getRole(),
                clubMember.getCreatedAt(),
                clubMember.getUser().getMajor(),
                clubMember.getUser().getGrade(),
                clubMember.getUser().getPhone(),
                clubMember.getGeneration(),
                feeStatus
        );
    }

    // 회비 컨텍스트가 없는 경로(회장 인계 응답 등)는 feeStatus 를 NONE 으로 둔다 — 해당 응답의 관심사가 아니다.
    public static ClubMemberQuery from(ClubMember clubMember) {
        return from(clubMember, MemberFeeStatus.NONE);
    }
}
