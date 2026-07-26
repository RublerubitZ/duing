package com.duing.domain.user.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;
import com.duing.global.time.TimeMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(description = "총동연 회원 상세 (ADMIN 전용)")
public record AdminUserDetailResponse(
        Long id,
        String name,
        String studentId,
        Grade grade,
        College college,
        String major,
        UserRole role,
        @Schema(description = "마스킹된 휴대폰. 원본은 /admin/users/{userId}/phone 으로 별도 조회한다.",
                example = "010-****-9983")
        String maskedPhone,
        @Schema(description = "MO 휴대폰 인증 완료 여부")
        boolean phoneVerified,
        Instant phoneVerifiedAt,
        UserStatus status,
        @Schema(description = "가입일") Instant createdAt,
        @Schema(description = "마지막 로그인. null 이면 기록 없음(백필하지 않았다).") Instant lastLoginAt,
        String adminNote,
        @Schema(description = "메모 최종 수정 시각. 저장 이력이 없으면 null") Instant adminNoteUpdatedAt,
        @Schema(description = "메모 최종 수정 작업자 이름. 저장 이력이 없으면 null") String adminNoteUpdatedBy,
        List<ClubItem> clubs,
        @Schema(description = "최근 관리자 조치 이력(개인정보 열람 제외, 최신순 최대 20건)")
        List<ActionItem> recentActions
) {

    @Schema(description = "가입 동아리 한 건")
    public record ClubItem(Long clubId, String clubName, ClubMemberRole role, Instant joinedAt) {
    }

    @Schema(description = "관리자 조치 이력 한 건")
    public record ActionItem(AdminUserAction action, String actorName, String reason, Instant at) {
    }

    public static AdminUserDetailResponse from(AdminUserDetailQuery detail) {
        return new AdminUserDetailResponse(
                detail.id(),
                detail.name(),
                detail.studentId(),
                detail.grade(),
                detail.college(),
                detail.major(),
                detail.role(),
                detail.maskedPhone(),
                detail.phoneVerified(),
                TimeMapper.systemWallClockToInstant(detail.phoneVerifiedAt()),
                detail.status(),
                TimeMapper.systemWallClockToInstant(detail.createdAt()),
                TimeMapper.systemWallClockToInstant(detail.lastLoginAt()),
                detail.adminNote(),
                // 감사 로그의 시각은 이미 Instant(timestamptz)다 — TimeMapper 를 태우면 이중 변환이 된다.
                detail.adminNoteUpdatedAt(),
                detail.adminNoteUpdatedBy(),
                detail.clubs().stream()
                        .map(club -> new ClubItem(club.clubId(), club.clubName(), club.role(),
                                TimeMapper.systemWallClockToInstant(club.joinedAt())))
                        .toList(),
                detail.recentActions().stream()
                        .map(action -> new ActionItem(action.action(), action.actorName(),
                                action.reason(), action.at()))
                        .toList()
        );
    }
}
