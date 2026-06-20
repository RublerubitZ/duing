package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;

/**
 * 서비스 내부 DTO. {@code phone} 은 원본이며, 직렬화는 항상 {@code ClubMemberResponse} 를 거쳐
 * 마스킹된 값으로만 나간다(원본 phone 은 응답에 포함되지 않음).
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
        String phone
) {
    public static ClubMemberQuery from(ClubMember clubMember) {
        return new ClubMemberQuery(
                clubMember.getId(),
                clubMember.getUser().getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getRole(),
                clubMember.getCreatedAt(),
                clubMember.getUser().getMajor(),
                clubMember.getUser().getGrade(),
                clubMember.getUser().getPhone()
        );
    }
}
