package com.duing.domain.user.service.dto.query;

import com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 총동연 회원 상세. 휴대폰은 마스킹된 값만 담는다 — 원본은 별도 엔드포인트에서 감사 로그와 함께 조회한다.
 * adminNoteUpdatedAt/By 는 users 컬럼이 아니라 최신 ADMIN_NOTE_UPDATED 감사 로그에서 파생한 값이다.
 */
public record AdminUserDetailQuery(
        Long id,
        String name,
        String studentId,
        Grade grade,
        College college,
        String major,
        UserRole role,
        String maskedPhone,
        boolean phoneVerified,
        LocalDateTime phoneVerifiedAt,
        UserStatus status,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt,
        String adminNote,
        Instant adminNoteUpdatedAt,
        String adminNoteUpdatedBy,
        List<UserClubMembershipQuery> clubs,
        List<AdminUserActionQuery> recentActions
) {
}
